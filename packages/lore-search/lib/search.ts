/**
 * lib/search.ts - SQLite FTS5 query functions
 *
 * Pure functions for querying the Lore FTS5 database.
 * Uses Bun's built-in SQLite for zero external dependencies.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";

// Result types
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
}

// Database path following XDG spec
function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
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

    let sql: string;
    let params: (string | number)[];

    if (options.source) {
      sql = `
        SELECT source, title, snippet(search, 2, '→', '←', '...', 32) as content, metadata, rank
        FROM search
        WHERE search MATCH ? AND source = ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [query, options.source, limit];
    } else {
      sql = `
        SELECT source, title, snippet(search, 2, '→', '←', '...', 32) as content, metadata, rank
        FROM search
        WHERE search MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [query, limit];
    }

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
