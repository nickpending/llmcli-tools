/**
 * lib/list.ts - Source listing functions
 *
 * Browse indexed sources without search queries.
 * Uses Bun's built-in SQLite for zero external dependencies.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";

// Source types - data sources that can be listed
export type Source =
  | "development"
  | "flux"
  | "events"
  | "blogs"
  | "commits"
  | "explorations"
  | "readmes"
  | "obsidian"
  | "captures"
  | "books"
  | "movies"
  | "podcasts"
  | "interests"
  | "people"
  | "habits"
  | "teachings"
  | "sessions"
  | "insights"
  | "learnings"
  | "observations";

export const SOURCES: Source[] = [
  "development",
  "flux",
  "events",
  "blogs",
  "commits",
  "explorations",
  "readmes",
  "obsidian",
  "captures",
  "books",
  "movies",
  "podcasts",
  "interests",
  "people",
  "habits",
  "teachings",
  "sessions",
  "insights",
  "learnings",
  "observations",
];

// Sources that query the 'personal' source with type filter
const PERSONAL_SUBTYPES: Partial<Record<Source, string>> = {
  books: "book",
  movies: "movie",
  podcasts: "podcast",
  interests: "interest",
  people: "person",
  habits: "habit",
};

export interface ListOptions {
  limit?: number;
  project?: string;
  type?: string;
}

export interface ListEntry {
  title: string;
  content: string;
  topic: string;
  type: string;
  metadata: Record<string, unknown>;
}

export interface ListResult {
  source: Source;
  entries: ListEntry[];
  count: number;
}

// Database path following XDG spec
function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
}

interface RawRow {
  title: string;
  content: string;
  topic: string;
  type: string;
  metadata: string;
}

/**
 * Query entries by source
 */
function queryBySource(
  db: Database,
  source: string,
  limit?: number,
  project?: string,
  type?: string,
): ListEntry[] {
  let sql =
    "SELECT title, content, topic, type, metadata FROM search WHERE source = ?";
  const params: (string | number)[] = [source];

  // Add project filter if provided — uses topic column directly
  if (project) {
    sql += " AND topic = ?";
    params.push(project);
  }

  // Add type filter if provided — uses type column directly
  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  // Order by timestamp descending (most recent first)
  sql += " ORDER BY timestamp DESC";

  if (limit) {
    sql += " LIMIT ?";
    params.push(limit);
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as RawRow[];

  return rows.map((row) => ({
    title: row.title,
    content: row.content,
    topic: row.topic,
    type: row.type,
    metadata: JSON.parse(row.metadata || "{}"),
  }));
}

/**
 * Query personal entries by subtype
 */
function queryPersonalType(
  db: Database,
  type: string,
  limit?: number,
): ListEntry[] {
  // Filter by type in SQL, not JS - avoids LIMIT truncation bug
  let sql = `
    SELECT title, content, topic, type, metadata FROM search
    WHERE source = 'personal'
      AND type = ?
    ORDER BY timestamp DESC
  `;
  const params: (string | number)[] = [type];

  if (limit) {
    sql += " LIMIT ?";
    params.push(limit);
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as RawRow[];

  return rows.map((row) => ({
    title: row.title,
    content: row.content,
    topic: row.topic,
    type: row.type,
    metadata: JSON.parse(row.metadata || "{}"),
  }));
}

/**
 * List all entries in a source
 *
 * @param source - The source to list (development, tasks, blogs, etc.)
 * @param options - Optional limit
 * @returns ListResult with entries and count
 * @throws Error if database doesn't exist or source is invalid
 */
export function list(source: Source, options: ListOptions = {}): ListResult {
  if (!SOURCES.includes(source)) {
    throw new Error(
      `Invalid source: ${source}. Valid sources: ${SOURCES.join(", ")}`,
    );
  }

  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-index-all first.`);
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    let entries: ListEntry[];

    // Check if this is a personal subtype source
    const personalType = PERSONAL_SUBTYPES[source];
    if (personalType) {
      entries = queryPersonalType(db, personalType, options.limit);
    } else {
      entries = queryBySource(
        db,
        source,
        options.limit,
        options.project,
        options.type,
      );
    }

    return {
      source,
      entries,
      count: entries.length,
    };
  } finally {
    db.close();
  }
}

/**
 * Get available sources
 */
export function listSources(): Source[] {
  return [...SOURCES];
}

/**
 * Extract project name from entry
 */
function extractProjectFromEntry(entry: ListEntry, _source: string): string {
  return entry.topic || "unknown";
}

/**
 * Extract identifier from entry based on source type
 */
function extractIdentifier(entry: ListEntry, source: string): string {
  const metadata = entry.metadata;

  switch (source) {
    case "commits":
      return (metadata.sha as string)?.substring(0, 7) || "";
    case "sessions":
      return (metadata.session_id as string)?.substring(0, 8) || "";
    default:
      return (metadata.id as string) || "";
  }
}

/**
 * Get the best display text for an entry
 * Commits use content (commit message), others use title
 */
function getDisplayText(entry: ListEntry, source: string): string {
  if (source === "commits") {
    return entry.content || entry.title;
  }
  return entry.title;
}

/**
 * Format list result as brief, compact output
 * One line per entry: "  project: identifier - title"
 */
export function formatBriefList(result: ListResult): string {
  const lines = [`${result.source} (${result.count}):`];

  result.entries.forEach((entry) => {
    const project = extractProjectFromEntry(entry, result.source);
    const identifier = extractIdentifier(entry, result.source);
    const displayText = getDisplayText(entry, result.source);

    const line = identifier
      ? `  ${project}: ${identifier} - ${displayText}`
      : `  ${project}: ${displayText}`;

    lines.push(line);
  });

  return lines.join("\n");
}
