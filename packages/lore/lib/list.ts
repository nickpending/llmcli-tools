/**
 * lib/list.ts - Domain listing functions
 *
 * Browse indexed domains without search queries.
 * Uses Bun's built-in SQLite for zero external dependencies.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";

// Domain types - sources that can be listed
export type Domain =
  | "development"
  | "tasks"
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
  | "sessions";

export const DOMAINS: Domain[] = [
  "development",
  "tasks",
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
];

// Domains that query the 'personal' source with type filter
const PERSONAL_SUBTYPES: Partial<Record<Domain, string>> = {
  books: "book",
  movies: "movie",
  podcasts: "podcast",
  interests: "interest",
  people: "person",
  habits: "habit",
};

// Maps source to metadata field containing project name
const PROJECT_FIELD: Record<string, string> = {
  commits: "project",
  sessions: "project",
  tasks: "project",
  captures: "context",
  teachings: "source",
};

export interface ListOptions {
  limit?: number;
  project?: string;
}

export interface ListEntry {
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ListResult {
  domain: Domain;
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
): ListEntry[] {
  let sql = "SELECT title, content, metadata FROM search WHERE source = ?";
  const params: (string | number)[] = [source];

  // Add project filter if provided and source has a project field
  if (project) {
    const field = PROJECT_FIELD[source];
    if (field) {
      sql += ` AND json_extract(metadata, '$.${field}') = ?`;
      params.push(project);
    }
  }

  if (limit) {
    sql += " LIMIT ?";
    params.push(limit);
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as RawRow[];

  return rows.map((row) => ({
    title: row.title,
    content: row.content,
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
  // Query personal source, then filter by type in metadata
  const sql = limit
    ? `SELECT title, content, metadata FROM search WHERE source = 'personal' LIMIT ?`
    : `SELECT title, content, metadata FROM search WHERE source = 'personal'`;

  const stmt = db.prepare(sql);
  const rows = (limit ? stmt.all(limit * 10) : stmt.all()) as RawRow[]; // Over-fetch for filtering

  const filtered = rows
    .map((row) => ({
      title: row.title,
      content: row.content,
      metadata: JSON.parse(row.metadata || "{}"),
    }))
    .filter((entry) => entry.metadata.type === type);

  return limit ? filtered.slice(0, limit) : filtered;
}

/**
 * List all entries in a domain
 *
 * @param domain - The domain to list (development, tasks, blogs, etc.)
 * @param options - Optional limit
 * @returns ListResult with entries and count
 * @throws Error if database doesn't exist or domain is invalid
 */
export function list(domain: Domain, options: ListOptions = {}): ListResult {
  if (!DOMAINS.includes(domain)) {
    throw new Error(
      `Invalid domain: ${domain}. Valid domains: ${DOMAINS.join(", ")}`,
    );
  }

  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-index-all first.`);
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    let entries: ListEntry[];

    // Check if this is a personal subtype domain
    const personalType = PERSONAL_SUBTYPES[domain];
    if (personalType) {
      entries = queryPersonalType(db, personalType, options.limit);
    } else {
      entries = queryBySource(db, domain, options.limit, options.project);
    }

    return {
      domain,
      entries,
      count: entries.length,
    };
  } finally {
    db.close();
  }
}

/**
 * Get available domains
 */
export function listDomains(): Domain[] {
  return [...DOMAINS];
}

/**
 * Extract project name from entry metadata
 */
function extractProjectFromEntry(entry: ListEntry, domain: string): string {
  const field = PROJECT_FIELD[domain];
  if (!field) return "unknown";
  return (entry.metadata[field] as string) || "unknown";
}

/**
 * Extract identifier from entry based on domain type
 */
function extractIdentifier(entry: ListEntry, domain: string): string {
  const metadata = entry.metadata;

  switch (domain) {
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
function getDisplayText(entry: ListEntry, domain: string): string {
  if (domain === "commits") {
    return entry.content || entry.title;
  }
  return entry.title;
}

/**
 * Format list result as brief, compact output
 * One line per entry: "  project: identifier - title"
 */
export function formatBriefList(result: ListResult): string {
  const lines = [`${result.domain} (${result.count}):`];

  result.entries.forEach((entry) => {
    const project = extractProjectFromEntry(entry, result.domain);
    const identifier = extractIdentifier(entry, result.domain);
    const displayText = getDisplayText(entry, result.domain);

    const line = identifier
      ? `  ${project}: ${identifier} - ${displayText}`
      : `  ${project}: ${displayText}`;

    lines.push(line);
  });

  return lines.join("\n");
}
