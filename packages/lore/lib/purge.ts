/**
 * lib/purge.ts - Purge entries from lore database
 *
 * Search and delete entries from purgeable sources (captures, observations, teachings).
 * Deletes from both FTS5 search table and vec0 embeddings table.
 *
 * Usage:
 *   const matches = findPurgeMatches(query);
 *   deleteEntries(matches.map(m => m.rowid));
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { getDatabasePath, openDatabase } from "./db.js";

// Only these sources can be purged — indexed sources (blogs, commits, etc.) are never purgeable
export const PURGEABLE_SOURCES = [
  "captures",
  "observations",
  "teachings",
] as const;

export type PurgeableSource = (typeof PURGEABLE_SOURCES)[number];

export interface PurgeMatch {
  rowid: number;
  source: string;
  title: string;
  content: string;
  type: string;
}

export interface PurgeResult {
  deleted: number;
  rowids: number[];
}

/**
 * Find entries matching query in purgeable sources using LIKE.
 *
 * Uses SQL LIKE instead of FTS5 MATCH because content strings
 * often contain dots, dashes, and special characters that break
 * FTS5 query syntax.
 */
export function findPurgeMatches(
  query: string,
  options: { source?: PurgeableSource } = {},
): PurgeMatch[] {
  const db = openDatabase(true);

  try {
    const conditions: string[] = ["content LIKE ?"];
    const params: (string | number)[] = [`%${query}%`];

    if (options.source) {
      conditions.push("source = ?");
      params.push(options.source);
    } else {
      const placeholders = PURGEABLE_SOURCES.map(() => "?").join(", ");
      conditions.push(`source IN (${placeholders})`);
      params.push(...PURGEABLE_SOURCES);
    }

    const sql = `
      SELECT rowid, source, title, content, type
      FROM search
      WHERE ${conditions.join(" AND ")}
      ORDER BY rowid DESC
    `;

    const stmt = db.prepare(sql);
    return stmt.all(...params) as PurgeMatch[];
  } finally {
    db.close();
  }
}

/**
 * Delete entries from both FTS5 search table and vec0 embeddings table.
 *
 * FTS5 DELETE: DELETE FROM search WHERE rowid = ?
 * vec0 DELETE: DELETE FROM embeddings WHERE doc_id = ?
 */
export function deleteEntries(rowids: number[]): PurgeResult {
  if (rowids.length === 0) {
    return { deleted: 0, rowids: [] };
  }

  // Open DB directly for read-write (matches realtime.ts pattern —
  // openDatabase(false) triggers SQLITE_MISUSE with custom_sqlite)
  const dbPath = getDatabasePath();
  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  const db = new Database(dbPath);

  try {
    // Load sqlite-vec extension for embeddings table access
    const vecPath = process.env.SQLITE_VEC_PATH;
    if (!vecPath) {
      throw new Error(
        'SQLITE_VEC_PATH not set. Get path with: python3 -c "import sqlite_vec; print(sqlite_vec.loadable_path())"',
      );
    }
    db.loadExtension(vecPath);

    const deleteSearch = db.prepare("DELETE FROM search WHERE rowid = ?");
    const deleteEmbedding = db.prepare(
      "DELETE FROM embeddings WHERE doc_id = ?",
    );

    let deleted = 0;

    for (const rowid of rowids) {
      deleteSearch.run(rowid);
      deleteEmbedding.run(rowid);
      deleted++;
    }

    return { deleted, rowids };
  } finally {
    db.close();
  }
}
