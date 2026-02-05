/**
 * lib/search.ts - SQLite FTS5 query functions
 *
 * Pure functions for querying the Lore FTS5 database.
 * Uses Bun's built-in SQLite for zero external dependencies.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";

export interface SearchResult {
  source: string;
  title: string;
  content: string;
  metadata: string;
  rank: number;
}

export interface SearchOptions {
  source?: string;
  limit?: number;
  since?: string;
}

function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
}

/**
 * Escape a query for safe FTS5 MATCH
 * Wraps terms in double quotes to prevent FTS5 syntax interpretation
 * (e.g., "real-time" being parsed as column:term)
 */
function escapeFts5Query(query: string): string {
  // Split on whitespace, wrap each term in quotes, rejoin
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" ");
}

/**
 * Search the Lore FTS5 database
 *
 * @param query - FTS5 search query (supports AND, OR, NOT, phrases)
 * @param options - Optional source filter and result limit
 * @returns Array of search results ranked by relevance
 * @throws Error if database doesn't exist or query fails
 */
export function search(
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    const limit = options.limit ?? 20;

    const conditions: string[] = ["search MATCH ?"];
    const params: (string | number)[] = [escapeFts5Query(query)];

    if (options.source) {
      conditions.push("source = ?");
      params.push(options.source);
    }

    if (options.since) {
      conditions.push(
        "json_extract(metadata, '$.date') IS NOT NULL AND json_extract(metadata, '$.date') != 'unknown' AND json_extract(metadata, '$.date') >= ?",
      );
      params.push(options.since);
    }

    params.push(limit);

    const sql = `
      SELECT source, title, snippet(search, 2, '→', '←', '...', 32) as content, metadata, rank
      FROM search
      WHERE ${conditions.join(" AND ")}
      ORDER BY rank
      LIMIT ?
    `;

    const stmt = db.prepare(sql);
    const results = stmt.all(...params) as SearchResult[];

    return results;
  } finally {
    db.close();
  }
}

/**
 * List all available sources in the database
 *
 * @returns Array of source names with entry counts
 */
export function listSources(): { source: string; count: number }[] {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    const stmt = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM search
      GROUP BY source
      ORDER BY count DESC
    `);
    return stmt.all() as { source: string; count: number }[];
  } finally {
    db.close();
  }
}
