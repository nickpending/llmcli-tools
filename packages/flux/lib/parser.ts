export type ItemType = "todo" | "bug" | "idea" | "note" | "changelog";
export type ItemStatus = "open" | "completed" | "cancelled";

export type DayOfWeek =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

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
  // For date-anchored recurring items
  due?: string; // YYYY-MM-DD format
  lead?: number; // Days before due to surface (default: 7)
  // For day-of-week anchored recurring items
  day?: DayOfWeek; // Day of week to surface (takes precedence over due:: and last::)
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

// Field extraction patterns
const FIELD_PATTERNS = {
  id: /\bid::([\w-]+)/,
  captured: /\bcaptured::\s*([\d-]+ [\d:]+)/,
  completed: /\bcompleted::\s*([\d-]+ [\d:]+)/,
  cancelled: /\bcancelled::\s*([\d-]+ [\d:]+)/,
  archived: /\barchived::\s*([\d-]+)/,
  last: /\blast::([\d-]+)/,
  due: /\bdue::([\d-]+)/,
  lead: /\blead::(\d+)/,
  day: /\bday::(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/,
  project: /\s\[([^\]\s][^\]]*)\]/, // Match [project] but not checkbox [ ]
  tags: /#(\w+)/g,
};

export function parseItem(line: string): FluxItem | null {
  if (!line.startsWith("- ")) return null;

  // Extract checkbox state
  const checkboxMatch = line.match(/^- \[([x ~])\]/);
  let checked: boolean | undefined;
  if (checkboxMatch) {
    checked = checkboxMatch[1] === "x";
  }

  // Extract type prefix (todo::, bug::, idea::, etc.)
  const typeMatch = line.match(/^- (?:\[[x ~]\] )?(\w+)::\s*/);
  const type = (typeMatch?.[1] as ItemType) || "todo";

  // Extract description (text after prefix, before fields)
  let descStart = line.indexOf("] ") + 2;
  if (descStart < 2) descStart = 2; // No checkbox
  if (typeMatch) {
    descStart = line.indexOf(":: ", descStart) + 3;
  }

  // Find where fields begin (first field marker)
  const fieldMarkers = [
    "id::",
    "captured::",
    "completed::",
    "cancelled::",
    "archived::",
    "last::",
    "due::",
    "lead::",
    "day::",
    " #",
  ];
  let descEnd = line.length;
  for (const marker of fieldMarkers) {
    const idx = line.indexOf(marker, descStart);
    if (idx !== -1 && idx < descEnd) {
      descEnd = idx;
    }
  }
  // Also check for [project] bracket
  const bracketIdx = line.indexOf(" [", descStart);
  if (bracketIdx !== -1 && bracketIdx < descEnd) {
    descEnd = bracketIdx;
  }

  const description = line.slice(descStart, descEnd).trim();

  // Extract fields
  const idMatch = line.match(FIELD_PATTERNS.id);
  const capturedMatch = line.match(FIELD_PATTERNS.captured);
  const completedMatch = line.match(FIELD_PATTERNS.completed);
  const cancelledMatch = line.match(FIELD_PATTERNS.cancelled);
  const archivedMatch = line.match(FIELD_PATTERNS.archived);
  const lastMatch = line.match(FIELD_PATTERNS.last);
  const dueMatch = line.match(FIELD_PATTERNS.due);
  const leadMatch = line.match(FIELD_PATTERNS.lead);
  const dayMatch = line.match(FIELD_PATTERNS.day);
  const projectMatch = line.match(FIELD_PATTERNS.project);

  // Extract tags
  const tags: string[] = [];
  let tagMatch;
  const tagRegex = /#(\w+)/g;
  while ((tagMatch = tagRegex.exec(line)) !== null) {
    tags.push(tagMatch[1]);
  }

  return {
    id: idMatch?.[1] || "",
    type,
    description,
    project: projectMatch?.[1] || undefined,
    captured: capturedMatch?.[1] || "",
    completed: completedMatch?.[1] || undefined,
    cancelled: cancelledMatch?.[1] || undefined,
    archived: archivedMatch?.[1] || undefined,
    last: lastMatch?.[1] || undefined,
    due: dueMatch?.[1] || undefined,
    lead: leadMatch ? parseInt(leadMatch[1], 10) : undefined,
    day: (dayMatch?.[1] as DayOfWeek) || undefined,
    tags: tags.length > 0 ? tags : undefined,
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

  if (item.day) {
    line += ` day::${item.day}`;
  }

  if (item.due) {
    line += ` due::${item.due}`;
  }

  if (item.lead !== undefined && item.lead !== 7) {
    // Only serialize if non-default
    line += ` lead::${item.lead}`;
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
