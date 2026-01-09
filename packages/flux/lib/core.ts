import { existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  discoverProjects,
  FluxConfig,
  FluxPaths,
  formatDate,
  formatDateTime,
  generateId,
  getArchivePath,
  getDailyPath,
  getPaths,
  getProjectBacklogPath,
  getProjectChangelogPath,
  loadConfig,
  validateProject,
} from "./config";
import {
  atomicWrite,
  ensureDir,
  readFileOrDefault,
  withFileLock,
} from "./files";
import {
  addItemToSection,
  ensureSection,
  findItemByFuzzy,
  FluxItem,
  getDefaultActiveContent,
  getDefaultDailyContent,
  getDefaultLaterContent,
  getDefaultProjectBacklogContent,
  getDefaultRecurringContent,
  ItemType,
  parseFile,
  ParsedFile,
  removeItemFromSection,
  serializeFile,
  serializeItem,
} from "./parser";

export interface AddOptions {
  text: string;
  project?: string;
  type?: ItemType;
  urgent?: boolean;
}

export interface AddResult {
  success: boolean;
  id: string;
  destination: string;
  item: FluxItem;
}

export interface DoneResult {
  success: boolean;
  id: string;
  description: string;
  source: string;
  destination: string;
}

export interface CancelResult {
  success: boolean;
  id: string;
  description: string;
  source: string;
  destination: string;
}

export interface ActivateResult {
  success: boolean;
  id: string;
  description: string;
  source: string;
  destination: string;
  section: string;
}

export interface DeferResult {
  success: boolean;
  id: string;
  description: string;
  source: string;
  destination: string;
}

export interface ListOptions {
  project?: string;
  type?: ItemType;
  backlog?: boolean;
  complete?: boolean;
}

export interface ListResult {
  items: FluxItem[];
  summary: {
    total: number;
    by_project: Record<string, number>;
    by_type: Record<string, number>;
  };
}

export interface RecurringResult {
  success: boolean;
  surfaced: FluxItem[];
  dryRun: boolean;
}

export interface LintIssue {
  file: string;
  line: number;
  issue: string;
  fixable: boolean;
  item?: FluxItem;
}

export interface LintResult {
  success: boolean;
  issues: LintIssue[];
  fixed: number;
}

export interface ArchiveResult {
  success: boolean;
  archived: number;
  dryRun: boolean;
}

async function getFileParsed(
  filePath: string,
  defaultContent: string,
): Promise<ParsedFile> {
  const content = await readFileOrDefault(filePath, defaultContent);
  return parseFile(content);
}

export async function add(options: AddOptions): Promise<AddResult> {
  const config = await loadConfig();
  const paths = getPaths(config);

  // Validate project if specified
  if (options.project) {
    validateProject(config, options.project);
  }

  const now = new Date();
  const id = generateId();

  const item: FluxItem = {
    id,
    type: options.type || "todo",
    description: options.text,
    project: options.project,
    captured: formatDateTime(now),
  };

  let destination: string;
  let sectionName: string;

  if (options.project) {
    // Project item goes to project backlog
    destination = getProjectBacklogPath(config, options.project);
    sectionName =
      options.type === "bug"
        ? "Bugs"
        : options.type === "idea"
          ? "Ideas"
          : "Todos";

    await withFileLock(destination, async () => {
      const defaultContent = getDefaultProjectBacklogContent(options.project!);
      const parsed = await getFileParsed(destination, defaultContent);
      const section = ensureSection(parsed, sectionName);
      // Remove project tag when writing to project file (redundant)
      const itemWithoutProject = { ...item, project: undefined };
      addItemToSection(section, itemWithoutProject);
      await atomicWrite(destination, serializeFile(parsed));
    });
  } else {
    // Non-project item goes to later.md
    destination = paths.later;
    sectionName = options.type === "idea" ? "Ideas" : "Todos";

    await withFileLock(destination, async () => {
      const parsed = await getFileParsed(destination, getDefaultLaterContent());
      const section = ensureSection(parsed, sectionName);
      addItemToSection(section, item);
      await atomicWrite(destination, serializeFile(parsed));
    });
  }

  // If urgent, also add to active.md
  if (options.urgent) {
    await withFileLock(paths.active, async () => {
      const parsed = await getFileParsed(
        paths.active,
        getDefaultActiveContent(),
      );
      const section = ensureSection(parsed, "Today");
      addItemToSection(section, item, true);
      await atomicWrite(paths.active, serializeFile(parsed));
    });
  }

  return {
    success: true,
    id,
    destination: options.urgent
      ? `${destination} + ${paths.active}`
      : destination,
    item,
  };
}

async function findItemAcrossFiles(
  config: FluxConfig,
  paths: FluxPaths,
  query: string,
  scopeProject?: string,
): Promise<{
  filePath: string;
  parsed: ParsedFile;
  section: ReturnType<typeof findItemByFuzzy> extends infer T ? T : never;
  inferredProject?: string;
} | null> {
  const searchPaths: { path: string; default: string; project?: string }[] = [];

  if (scopeProject) {
    // Project scope: only search project backlog
    const projectPath = getProjectBacklogPath(config, scopeProject);
    searchPaths.push({
      path: projectPath,
      default: getDefaultProjectBacklogContent(scopeProject),
      project: scopeProject,
    });
  } else {
    // Global scope: only search active.md and later.md
    searchPaths.push(
      { path: paths.active, default: getDefaultActiveContent() },
      { path: paths.later, default: getDefaultLaterContent() },
    );
  }

  for (const { path, default: defaultContent, project } of searchPaths) {
    if (!existsSync(path)) continue;
    const parsed = await getFileParsed(path, defaultContent);
    const found = findItemByFuzzy(parsed.sections, query);
    if (found) {
      return {
        filePath: path,
        parsed,
        section: found,
        inferredProject: project,
      };
    }
  }

  return null;
}

export interface DoneOptions {
  project?: string;
}

export async function done(
  query: string,
  options: DoneOptions = {},
): Promise<DoneResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();

  const found = await findItemAcrossFiles(
    config,
    paths,
    query,
    options.project,
  );
  if (!found || !found.section) {
    throw new Error(`Item not found: ${query}`);
  }

  const { filePath, parsed, section } = found;
  const { item, index } = section;

  // Mark as completed
  item.completed = formatDateTime(now);
  item.checked = true;

  // Remove from source
  await withFileLock(filePath, async () => {
    removeItemFromSection(section.section, index);
    await atomicWrite(filePath, serializeFile(parsed));
  });

  // Add to daily file
  const dailyPath = getDailyPath(config, now);
  await withFileLock(dailyPath, async () => {
    const dailyParsed = await getFileParsed(
      dailyPath,
      getDefaultDailyContent(formatDate(now)),
    );
    const completedSection = ensureSection(dailyParsed, "Completed");
    addItemToSection(completedSection, item, true);
    await atomicWrite(dailyPath, serializeFile(dailyParsed));
  });

  // If project item, also add to project changelog
  if (item.project) {
    const changelogPath = getProjectChangelogPath(config, item.project);
    await withFileLock(changelogPath, async () => {
      let content = await readFileOrDefault(
        changelogPath,
        `# ${item.project} Changelog\n`,
      );
      const dateStr = formatDate(now);
      const dateSectionHeader = `## ${dateStr}`;

      if (!content.includes(dateSectionHeader)) {
        // Add new date section at top (after title)
        const lines = content.split("\n");
        const titleIndex = lines.findIndex((l) => l.startsWith("# "));
        lines.splice(titleIndex + 1, 0, "", dateSectionHeader);
        content = lines.join("\n");
      }

      // Add item under date section
      const changelogItem = `- changelog:: ${item.description} id::${item.id} captured:: ${item.captured} completed:: ${item.completed}`;
      const lines = content.split("\n");
      const sectionIndex = lines.findIndex((l) => l === dateSectionHeader);
      lines.splice(sectionIndex + 1, 0, changelogItem);
      await atomicWrite(changelogPath, lines.join("\n"));
    });
  }

  return {
    success: true,
    id: item.id,
    description: item.description,
    source: filePath,
    destination: dailyPath,
  };
}

export interface CancelOptions {
  project?: string;
}

export async function cancel(
  query: string,
  options: CancelOptions = {},
): Promise<CancelResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();

  const found = await findItemAcrossFiles(
    config,
    paths,
    query,
    options.project,
  );
  if (!found || !found.section) {
    throw new Error(`Item not found: ${query}`);
  }

  const { filePath, parsed, section } = found;
  const { item, index } = section;

  // Mark as cancelled
  item.cancelled = formatDateTime(now);

  // Remove from source
  await withFileLock(filePath, async () => {
    removeItemFromSection(section.section, index);
    await atomicWrite(filePath, serializeFile(parsed));
  });

  // Add to daily file under Cancelled
  const dailyPath = getDailyPath(config, now);
  await withFileLock(dailyPath, async () => {
    const dailyParsed = await getFileParsed(
      dailyPath,
      getDefaultDailyContent(formatDate(now)),
    );
    const cancelledSection = ensureSection(dailyParsed, "Cancelled");
    addItemToSection(cancelledSection, item, true);
    await atomicWrite(dailyPath, serializeFile(dailyParsed));
  });

  return {
    success: true,
    id: item.id,
    description: item.description,
    source: filePath,
    destination: dailyPath,
  };
}

export interface ActivateOptions {
  week?: boolean;
  project?: string;
}

export async function activate(
  query: string,
  options: ActivateOptions = {},
): Promise<ActivateResult> {
  const config = await loadConfig();
  const paths = getPaths(config);

  const found = await findItemAcrossFiles(
    config,
    paths,
    query,
    options.project,
  );
  if (!found || !found.section) {
    throw new Error(`Item not found: ${query}`);
  }

  const { filePath, parsed, section, inferredProject } = found;
  const { item, index } = section;

  // Don't activate from active.md
  if (filePath === paths.active) {
    throw new Error(`Item is already in active.md`);
  }

  // Set project from inferred source if not already set
  if (!item.project && inferredProject) {
    item.project = inferredProject;
  }

  // Remove from source
  await withFileLock(filePath, async () => {
    removeItemFromSection(section.section, index);
    await atomicWrite(filePath, serializeFile(parsed));
  });

  // Add to active.md
  const targetSection = options.week ? "This Week" : "Today";
  await withFileLock(paths.active, async () => {
    const activeParsed = await getFileParsed(
      paths.active,
      getDefaultActiveContent(),
    );
    const activeSection = ensureSection(activeParsed, targetSection);
    item.checked = false;
    addItemToSection(activeSection, item, true);
    await atomicWrite(paths.active, serializeFile(activeParsed));
  });

  return {
    success: true,
    id: item.id,
    description: item.description,
    source: filePath,
    destination: paths.active,
    section: targetSection,
  };
}

export interface DeferOptions {
  project?: string;
}

export async function defer(
  query: string,
  options: DeferOptions = {},
): Promise<DeferResult> {
  const config = await loadConfig();
  const paths = getPaths(config);

  // Defer always searches active.md (project scope not applicable)
  const activeParsed = await getFileParsed(
    paths.active,
    getDefaultActiveContent(),
  );
  const found = findItemByFuzzy(activeParsed.sections, query);

  if (!found) {
    throw new Error(`Item not found in active.md: ${query}`);
  }

  const { item, index, section } = found;

  // Remove from active
  await withFileLock(paths.active, async () => {
    removeItemFromSection(section, index);
    await atomicWrite(paths.active, serializeFile(activeParsed));
  });

  // Determine destination
  let destination: string;
  if (item.project) {
    destination = getProjectBacklogPath(config, item.project);
    await withFileLock(destination, async () => {
      const parsed = await getFileParsed(
        destination,
        getDefaultProjectBacklogContent(item.project!),
      );
      const sectionName =
        item.type === "bug" ? "Bugs" : item.type === "idea" ? "Ideas" : "Todos";
      const targetSection = ensureSection(parsed, sectionName);
      const itemWithoutProject = {
        ...item,
        project: undefined,
        checked: undefined,
      };
      addItemToSection(targetSection, itemWithoutProject);
      await atomicWrite(destination, serializeFile(parsed));
    });
  } else {
    destination = paths.later;
    await withFileLock(destination, async () => {
      const parsed = await getFileParsed(destination, getDefaultLaterContent());
      const sectionName = item.type === "idea" ? "Ideas" : "Todos";
      const targetSection = ensureSection(parsed, sectionName);
      const itemClean = { ...item, checked: undefined };
      addItemToSection(targetSection, itemClean);
      await atomicWrite(destination, serializeFile(parsed));
    });
  }

  return {
    success: true,
    id: item.id,
    description: item.description,
    source: paths.active,
    destination,
  };
}

export async function list(options: ListOptions = {}): Promise<ListResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const items: FluxItem[] = [];

  if (options.project) {
    // Project scope
    if (options.complete) {
      // Project completed: read projects/{project}/completed.md
      const changelogPath = getProjectChangelogPath(config, options.project);
      if (existsSync(changelogPath)) {
        const parsed = await getFileParsed(
          changelogPath,
          `# ${options.project} Changelog\n`,
        );
        for (const section of parsed.sections) {
          for (const item of section.items) {
            items.push({ ...item, project: options.project });
          }
        }
      }
    } else if (options.backlog) {
      // Project backlog: read projects/{project}/later.md
      const backlogPath = getProjectBacklogPath(config, options.project);
      if (existsSync(backlogPath)) {
        const parsed = await getFileParsed(
          backlogPath,
          getDefaultProjectBacklogContent(options.project),
        );
        for (const section of parsed.sections) {
          for (const item of section.items) {
            items.push({ ...item, project: options.project });
          }
        }
      }
    } else {
      // Project active: read active.md, filter by project tag
      if (existsSync(paths.active)) {
        const parsed = await getFileParsed(
          paths.active,
          getDefaultActiveContent(),
        );
        for (const section of parsed.sections) {
          for (const item of section.items) {
            if (item.project === options.project) {
              items.push(item);
            }
          }
        }
      }
    }
  } else {
    // Global scope
    if (options.complete) {
      // Global completed: read today's daily log
      const today = new Date();
      const dailyPath = getDailyPath(config, today);
      if (existsSync(dailyPath)) {
        const parsed = await getFileParsed(
          dailyPath,
          getDefaultDailyContent(formatDate(today)),
        );
        for (const section of parsed.sections) {
          items.push(...section.items);
        }
      }
    } else if (options.backlog) {
      // Global backlog: read later.md
      if (existsSync(paths.later)) {
        const parsed = await getFileParsed(
          paths.later,
          getDefaultLaterContent(),
        );
        for (const section of parsed.sections) {
          items.push(...section.items);
        }
      }
    } else {
      // Global active: read active.md, filter items WITHOUT project tag
      if (existsSync(paths.active)) {
        const parsed = await getFileParsed(
          paths.active,
          getDefaultActiveContent(),
        );
        for (const section of parsed.sections) {
          for (const item of section.items) {
            if (!item.project) {
              items.push(item);
            }
          }
        }
      }
    }
  }

  // Apply type filter if specified
  let filtered = items;
  if (options.type) {
    filtered = filtered.filter((item) => item.type === options.type);
  }

  // Build summary
  const byProject: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const item of filtered) {
    const proj = item.project || "none";
    byProject[proj] = (byProject[proj] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
  }

  return {
    items: filtered,
    summary: {
      total: filtered.length,
      by_project: byProject,
      by_type: byType,
    },
  };
}

function getCadenceDays(cadence: string | undefined): number {
  switch (cadence) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    case "quarterly":
      return 90;
    case "yearly":
      return 365;
    default:
      return 999999;
  }
}

const DEFAULT_LEAD_DAYS = 7;

// Day-of-week mapping: JS Date.getDay() returns 0=Sunday through 6=Saturday
const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export async function recurring(dryRun = false): Promise<RecurringResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();

  if (!existsSync(paths.recurring)) {
    return { success: true, surfaced: [], dryRun };
  }

  const parsed = await getFileParsed(
    paths.recurring,
    getDefaultRecurringContent(),
  );

  const toSurface: FluxItem[] = [];

  for (const section of parsed.sections) {
    const cadence = section.name.toLowerCase() as FluxItem["cadence"];
    const cadenceDays = getCadenceDays(cadence);

    for (const item of section.items) {
      item.cadence = cadence;

      if (item.day) {
        // Day-of-week anchored: surface on specific day each week (highest priority)
        const targetDay = DAY_MAP[item.day];
        const todayDay = now.getDay();

        if (todayDay === targetDay) {
          toSurface.push(item);
        }
      } else if (item.due) {
        // Date-anchored item: trigger by approaching due date
        const dueDate = new Date(item.due);
        const leadDays = item.lead ?? DEFAULT_LEAD_DAYS;
        const daysUntilDue = Math.floor(
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysUntilDue <= leadDays) {
          toSurface.push(item);
        }
      } else {
        // Cadence-based item: trigger by time since last done
        if (!item.last) {
          // Never done, surface it
          toSurface.push(item);
        } else {
          const lastDate = new Date(item.last);
          const daysSince = Math.floor(
            (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (daysSince >= cadenceDays) {
            toSurface.push(item);
          }
        }
      }
    }
  }

  if (dryRun) {
    return { success: true, surfaced: toSurface, dryRun: true };
  }

  // Surface to active.md
  if (toSurface.length > 0) {
    await withFileLock(paths.active, async () => {
      const activeParsed = await getFileParsed(
        paths.active,
        getDefaultActiveContent(),
      );
      const todaySection = ensureSection(activeParsed, "Today");

      for (const item of toSurface) {
        // Check if already in active (by id)
        const alreadyActive = activeParsed.sections.some((s) =>
          s.items.some((i) => i.id === item.id),
        );
        if (!alreadyActive) {
          const activeItem: FluxItem = {
            ...item,
            checked: false,
          };
          addItemToSection(todaySection, activeItem, true);
        }
      }

      await atomicWrite(paths.active, serializeFile(activeParsed));
    });
  }

  return { success: true, surfaced: toSurface, dryRun: false };
}

function advanceByCadence(
  dateStr: string,
  cadence: string | undefined,
): string {
  // Parse date string directly to avoid timezone issues
  const [year, month, day] = dateStr.split("-").map(Number);

  let newYear = year;
  let newMonth = month;
  let newDay = day;

  switch (cadence) {
    case "daily":
      newDay += 1;
      break;
    case "weekly":
      newDay += 7;
      break;
    case "monthly":
      newMonth += 1;
      break;
    case "quarterly":
      newMonth += 3;
      break;
    case "yearly":
      newYear += 1;
      break;
  }

  // Normalize using Date (handles overflow like Jan 32 → Feb 1)
  const result = new Date(newYear, newMonth - 1, newDay);
  const y = result.getFullYear();
  const m = String(result.getMonth() + 1).padStart(2, "0");
  const d = String(result.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function completeRecurring(query: string): Promise<void> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const today = formatDate(new Date());

  // Find in recurring.md and update
  await withFileLock(paths.recurring, async () => {
    const parsed = await getFileParsed(
      paths.recurring,
      getDefaultRecurringContent(),
    );
    const found = findItemByFuzzy(parsed.sections, query);

    if (found) {
      const item = found.item;
      const cadence = found.section.name.toLowerCase();

      if (item.day) {
        // Day-of-week anchored: no last:: update needed
        // Item will resurface next week on the anchored day
        // Clear last:: if present (not used for day-anchored items)
        item.last = undefined;
      } else if (item.due) {
        // Date-anchored: advance due date by cadence from OLD due date
        item.due = advanceByCadence(item.due, cadence);
        // Clear last:: if present (not used for due-date items)
        item.last = undefined;
      } else {
        // Cadence-based: update last:: to today
        item.last = today;
      }

      // Rebuild file content to preserve all fields
      let content = `# Recurring\n`;
      for (const section of parsed.sections) {
        content += `\n## ${section.name}\n`;
        for (const sectionItem of section.items) {
          let line = `- [ ] ${sectionItem.description}`;
          if (sectionItem.tags && sectionItem.tags.length > 0) {
            line += " " + sectionItem.tags.map((t) => `#${t}`).join(" ");
          }
          if (sectionItem.id) {
            line += ` id::${sectionItem.id}`;
          }
          if (sectionItem.day) {
            line += ` day::${sectionItem.day}`;
          }
          if (sectionItem.due) {
            line += ` due::${sectionItem.due}`;
          }
          if (sectionItem.lead !== undefined && sectionItem.lead !== 7) {
            line += ` lead::${sectionItem.lead}`;
          }
          if (sectionItem.last) {
            line += ` last::${sectionItem.last}`;
          }
          content += line + "\n";
        }
      }
      await atomicWrite(paths.recurring, content);
    }
  });

  // Remove from active.md
  await withFileLock(paths.active, async () => {
    const activeParsed = await getFileParsed(
      paths.active,
      getDefaultActiveContent(),
    );
    const found = findItemByFuzzy(activeParsed.sections, query);
    if (found) {
      removeItemFromSection(found.section, found.index);
      await atomicWrite(paths.active, serializeFile(activeParsed));
    }
  });
}

export async function lint(path?: string, fix = false): Promise<LintResult> {
  const config = await loadConfig();
  const paths = getPaths(config);

  const issues: LintIssue[] = [];
  let fixed = 0;

  const filesToLint: string[] = [];

  if (path) {
    filesToLint.push(path);
  } else {
    // Lint all flux files
    if (existsSync(paths.active)) filesToLint.push(paths.active);
    if (existsSync(paths.later)) filesToLint.push(paths.later);
    if (existsSync(paths.recurring)) filesToLint.push(paths.recurring);

    // Project backlogs
    for (const project of discoverProjects(config)) {
      const projectPath = getProjectBacklogPath(config, project);
      if (existsSync(projectPath)) {
        filesToLint.push(projectPath);
      }
    }
  }

  for (const filePath of filesToLint) {
    const content = await Bun.file(filePath).text();
    const lines = content.split("\n");
    const needsFix: { line: number; item: FluxItem; fixed: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("- ")) continue;

      // Check for missing ID
      if (!line.includes("id::")) {
        const issue: LintIssue = {
          file: filePath,
          line: i + 1,
          issue: "Missing id::",
          fixable: true,
        };
        issues.push(issue);

        if (fix) {
          const newId = generateId();
          lines[i] = line.trimEnd() + ` id::${newId}`;
          fixed++;
        }
      }

      // Check for missing captured:: (except recurring)
      if (!line.includes("captured::") && !filePath.includes("recurring")) {
        const issue: LintIssue = {
          file: filePath,
          line: i + 1,
          issue: "Missing captured::",
          fixable: true,
        };
        issues.push(issue);

        if (fix) {
          lines[i] =
            lines[i].trimEnd() + ` captured:: ${formatDateTime(new Date())}`;
          fixed++;
        }
      }
    }

    if (fix && fixed > 0) {
      await atomicWrite(filePath, lines.join("\n"));
    }
  }

  return {
    success: issues.length === 0 || fix,
    issues,
    fixed,
  };
}

export async function archive(dryRun = false): Promise<ArchiveResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();
  const threshold = config.behavior.archive_after_days;

  let archivedCount = 0;
  const toArchive: { item: FluxItem; dailyPath: string }[] = [];

  // Scan daily files
  await ensureDir(paths.daily);
  const dailyFiles = readdirSync(paths.daily).filter((f) => f.endsWith(".md"));

  for (const filename of dailyFiles) {
    const dailyPath = join(paths.daily, filename);
    const parsed = await getFileParsed(dailyPath, "");

    for (const section of parsed.sections) {
      if (section.name !== "Completed") continue;

      for (const item of section.items) {
        if (!item.completed) continue;

        const completedDate = new Date(item.completed.split(" ")[0]);
        const daysSince = Math.floor(
          (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysSince >= threshold) {
          toArchive.push({ item, dailyPath });
        }
      }
    }
  }

  if (dryRun) {
    return { success: true, archived: toArchive.length, dryRun: true };
  }

  // Group by archive month
  const byMonth: Record<string, FluxItem[]> = {};
  for (const { item } of toArchive) {
    const completedDate = new Date(item.completed!.split(" ")[0]);
    const archivePath = getArchivePath(config, completedDate);
    byMonth[archivePath] = byMonth[archivePath] || [];
    byMonth[archivePath].push(item);
  }

  // Write to archive files
  for (const [archivePath, items] of Object.entries(byMonth)) {
    await ensureDir(paths.archive);
    await withFileLock(archivePath, async () => {
      let content = await readFileOrDefault(archivePath, "");
      if (!content) {
        const [, yearMonth] = archivePath.match(/(\d{4}-\d{2})\.md$/) || [];
        content = `# ${yearMonth} Archive\n`;
      }

      for (const item of items) {
        item.archived = formatDate(now);
        const line = serializeItem(item, true);
        content += line + "\n";
        archivedCount++;
      }

      await atomicWrite(archivePath, content);
    });
  }

  // Remove archived items from daily files
  const dailyPathsToClean = [...new Set(toArchive.map((t) => t.dailyPath))];
  for (const dailyPath of dailyPathsToClean) {
    await withFileLock(dailyPath, async () => {
      const parsed = await getFileParsed(dailyPath, "");
      const completedSection = parsed.sections.find(
        (s) => s.name === "Completed",
      );
      if (completedSection) {
        const idsToRemove = new Set(
          toArchive
            .filter((t) => t.dailyPath === dailyPath)
            .map((t) => t.item.id),
        );
        completedSection.items = completedSection.items.filter(
          (item) => !idsToRemove.has(item.id),
        );
      }
      await atomicWrite(dailyPath, serializeFile(parsed));
    });
  }

  return { success: true, archived: archivedCount, dryRun: false };
}

// Re-export types
export type { DayOfWeek, FluxItem, ItemType } from "./parser";
export type { FluxConfig, FluxPaths } from "./config";
