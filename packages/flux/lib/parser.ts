export type ItemType = "todo" | "bug" | "idea" | "note" | "changelog";
export type ItemStatus = "open" | "completed" | "cancelled";

export interface FluxItem {
  id: string;
  type: ItemType;
  description: string;
  project?: string;
  captured: string;
  completed?: string;
  cancelled?: string;
  archived?: string;
  tags?: string[];
  // For recurring items
  last?: string;
  cadence?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  // Checkbox state (for active.md)
  checked?: boolean;
}

export interface ParsedSection {
  name: string;
  items: FluxItem[];
  rawLines: string[];
}

export interface ParsedFile {
  title: string;
  sections: ParsedSection[];
  rawContent: string;
}

const ITEM_REGEX =
  /^- (\[[ x~]\] )?(?:(\w+):: )?(.+?)(?:\s+\[([^\]]+)\])?(?:\s+id::(\w+))?(?:\s+captured:: ([\d-]+ [\d:]+))?(?:\s+completed:: ([\d-]+ [\d:]+))?(?:\s+cancelled:: ([\d-]+ [\d:]+))?(?:\s+archived:: ([\d-]+))?(?:\s+last::([\d-]+))?(?:\s+(#\w+(?:\s+#\w+)*))?$/;

export function parseItem(line: string): FluxItem | null {
  const match = line.match(ITEM_REGEX);
  if (!match) return null;

  const [
    ,
    checkbox,
    typePrefix,
    description,
    project,
    id,
    captured,
    completed,
    cancelled,
    archived,
    last,
    tagsStr,
  ] = match;

  let checked: boolean | undefined;
  if (checkbox) {
    checked = checkbox.includes("x");
  }

  const type = (typePrefix as ItemType) || "todo";
  const tags = tagsStr
    ? tagsStr
        .split(/\s+/)
        .filter((t) => t.startsWith("#"))
        .map((t) => t.slice(1))
    : undefined;

  return {
    id: id || "",
    type,
    description: description.trim(),
    project: project || undefined,
    captured: captured || "",
    completed: completed || undefined,
    cancelled: cancelled || undefined,
    archived: archived || undefined,
    last: last || undefined,
    tags,
    checked,
  };
}

export function parseFile(content: string): ParsedFile {
  const lines = content.split("\n");
  const sections: ParsedSection[] = [];
  let title = "";
  let currentSection: ParsedSection | null = null;

  for (const line of lines) {
    if (line.startsWith("# ") && !title) {
      title = line.slice(2).trim();
      continue;
    }

    if (line.startsWith("## ")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        name: line.slice(3).trim(),
        items: [],
        rawLines: [],
      };
      continue;
    }

    if (currentSection) {
      currentSection.rawLines.push(line);
      if (line.startsWith("- ")) {
        const item = parseItem(line);
        if (item) {
          currentSection.items.push(item);
        }
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return { title, sections, rawContent: content };
}

export function serializeItem(item: FluxItem, includeCheckbox = false): string {
  let line = "- ";

  if (includeCheckbox || item.checked !== undefined) {
    if (item.cancelled) {
      line += "[~] ";
    } else if (item.completed || item.checked) {
      line += "[x] ";
    } else {
      line += "[ ] ";
    }
  }

  if (item.type && item.type !== "todo") {
    line += `${item.type}:: `;
  } else if (!includeCheckbox) {
    line += `${item.type}:: `;
  }

  line += item.description;

  if (item.project) {
    line += ` [${item.project}]`;
  }

  if (item.id) {
    line += ` id::${item.id}`;
  }

  if (item.captured) {
    line += ` captured:: ${item.captured}`;
  }

  if (item.completed) {
    line += ` completed:: ${item.completed}`;
  }

  if (item.cancelled) {
    line += ` cancelled:: ${item.cancelled}`;
  }

  if (item.archived) {
    line += ` archived:: ${item.archived}`;
  }

  if (item.last) {
    line += ` last::${item.last}`;
  }

  if (item.tags && item.tags.length > 0) {
    line += " " + item.tags.map((t) => `#${t}`).join(" ");
  }

  return line;
}

export function findItemById(
  sections: ParsedSection[],
  id: string,
): { section: ParsedSection; item: FluxItem; index: number } | null {
  for (const section of sections) {
    const index = section.items.findIndex((item) => item.id === id);
    if (index !== -1) {
      return { section, item: section.items[index], index };
    }
  }
  return null;
}

export function findItemByFuzzy(
  sections: ParsedSection[],
  query: string,
): { section: ParsedSection; item: FluxItem; index: number } | null {
  const lowerQuery = query.toLowerCase();

  // First try exact ID match
  for (const section of sections) {
    const index = section.items.findIndex((item) => item.id === query);
    if (index !== -1) {
      return { section, item: section.items[index], index };
    }
  }

  // Then try partial ID match
  for (const section of sections) {
    const index = section.items.findIndex((item) =>
      item.id.startsWith(lowerQuery),
    );
    if (index !== -1) {
      return { section, item: section.items[index], index };
    }
  }

  // Then try description match
  for (const section of sections) {
    const index = section.items.findIndex((item) =>
      item.description.toLowerCase().includes(lowerQuery),
    );
    if (index !== -1) {
      return { section, item: section.items[index], index };
    }
  }

  return null;
}

export function removeItemFromSection(
  section: ParsedSection,
  index: number,
): void {
  const item = section.items[index];
  section.items.splice(index, 1);

  // Remove from raw lines
  const rawIndex = section.rawLines.findIndex(
    (line) =>
      line.includes(`id::${item.id}`) || line.includes(item.description),
  );
  if (rawIndex !== -1) {
    section.rawLines.splice(rawIndex, 1);
  }
}

export function addItemToSection(
  section: ParsedSection,
  item: FluxItem,
  includeCheckbox = false,
): void {
  section.items.push(item);
  section.rawLines.push(serializeItem(item, includeCheckbox));
}

export function serializeFile(parsed: ParsedFile): string {
  let content = `# ${parsed.title}\n`;

  for (const section of parsed.sections) {
    content += `\n## ${section.name}\n`;
    for (const item of section.items) {
      const includeCheckbox =
        section.name === "Today" ||
        section.name === "This Week" ||
        section.name === "Completed" ||
        section.name === "Cancelled";
      content += serializeItem(item, includeCheckbox) + "\n";
    }
  }

  return content;
}

export function ensureSection(
  parsed: ParsedFile,
  sectionName: string,
): ParsedSection {
  let section = parsed.sections.find((s) => s.name === sectionName);
  if (!section) {
    section = { name: sectionName, items: [], rawLines: [] };
    parsed.sections.push(section);
  }
  return section;
}

export function getDefaultActiveContent(): string {
  return `# Active

## Today

## This Week
`;
}

export function getDefaultLaterContent(): string {
  return `# Later

## Ideas

## Todos
`;
}

export function getDefaultProjectBacklogContent(project: string): string {
  return `# ${project} Backlog

## Ideas

## Todos

## Bugs
`;
}

export function getDefaultDailyContent(date: string): string {
  return `# ${date}

## Completed

## Cancelled

## Notes
`;
}

export function getDefaultRecurringContent(): string {
  return `# Recurring

## Daily

## Weekly

## Monthly

## Quarterly

## Yearly
`;
}
