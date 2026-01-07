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
): Promise<{
  filePath: string;
  parsed: ParsedFile;
  section: ReturnType<typeof findItemByFuzzy> extends infer T ? T : never;
  inferredProject?: string;
} | null> {
  // Search order: active, later, project backlogs
  const searchPaths: { path: string; default: string; project?: string }[] = [
    { path: paths.active, default: getDefaultActiveContent() },
    { path: paths.later, default: getDefaultLaterContent() },
  ];

  // Add project backlogs
  for (const project of discoverProjects(config)) {
    const projectPath = getProjectBacklogPath(config, project);
    if (existsSync(projectPath)) {
      searchPaths.push({
        path: projectPath,
        default: getDefaultProjectBacklogContent(project),
        project,
      });
    }
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

export async function done(query: string): Promise<DoneResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();

  const found = await findItemAcrossFiles(config, paths, query);
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

export async function cancel(query: string): Promise<CancelResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();

  const found = await findItemAcrossFiles(config, paths, query);
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

export async function activate(
  query: string,
  week = false,
): Promise<ActivateResult> {
  const config = await loadConfig();
  const paths = getPaths(config);

  const found = await findItemAcrossFiles(config, paths, query);
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
  const targetSection = week ? "This Week" : "Today";
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

export async function defer(query: string): Promise<DeferResult> {
  const config = await loadConfig();
  const paths = getPaths(config);

  // Only search active.md for defer
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

  const allItems: FluxItem[] = [];

  // Collect from active.md
  if (existsSync(paths.active)) {
    const parsed = await getFileParsed(paths.active, getDefaultActiveContent());
    for (const section of parsed.sections) {
      allItems.push(...section.items);
    }
  }

  // Collect from later.md
  if (existsSync(paths.later)) {
    const parsed = await getFileParsed(paths.later, getDefaultLaterContent());
    for (const section of parsed.sections) {
      allItems.push(...section.items);
    }
  }

  // Collect from project backlogs
  for (const project of discoverProjects(config)) {
    const projectPath = getProjectBacklogPath(config, project);
    if (existsSync(projectPath)) {
      const parsed = await getFileParsed(
        projectPath,
        getDefaultProjectBacklogContent(project),
      );
      for (const section of parsed.sections) {
        for (const item of section.items) {
          allItems.push({ ...item, project });
        }
      }
    }
  }

  // Filter
  let filtered = allItems;
  if (options.project) {
    filtered = filtered.filter((item) => item.project === options.project);
  }
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

export async function recurring(dryRun = false): Promise<RecurringResult> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const now = new Date();
  const today = formatDate(now);

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

      // Check if due
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

export async function completeRecurring(query: string): Promise<void> {
  const config = await loadConfig();
  const paths = getPaths(config);
  const today = formatDate(new Date());

  // Find in recurring.md and update last::
  await withFileLock(paths.recurring, async () => {
    const parsed = await getFileParsed(
      paths.recurring,
      getDefaultRecurringContent(),
    );
    const found = findItemByFuzzy(parsed.sections, query);

    if (found) {
      found.item.last = today;

      // Rebuild file content manually to preserve last:: field
      let content = `# Recurring\n`;
      for (const section of parsed.sections) {
        content += `\n## ${section.name}\n`;
        for (const item of section.items) {
          let line = `- [ ] ${item.description}`;
          if (item.tags && item.tags.length > 0) {
            line += " " + item.tags.map((t) => `#${t}`).join(" ");
          }
          if (item.id) {
            line += ` id::${item.id}`;
          }
          if (item.last) {
            line += ` last::${item.last}`;
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
export type { FluxItem, ItemType } from "./parser";
export type { FluxConfig, FluxPaths } from "./config";
