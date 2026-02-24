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
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { getDatabasePath, openDatabase } from "./db.js";
import { getConfig } from "./config.js";

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
  logEntriesRemoved: number;
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
 * Delete entries from FTS5 search table, vec0 embeddings table,
 * and optionally clean matching lines from log.jsonl.
 *
 * @param rowids - Row IDs to delete from search + embeddings
 * @param matchContents - Content strings from findPurgeMatches for log.jsonl filtering.
 *   Optional (default []); when empty, log.jsonl cleanup is skipped.
 *   This avoids a breaking change for existing callers.
 */
export function deleteEntries(
  rowids: number[],
  matchContents: string[] = [],
): PurgeResult {
  if (rowids.length === 0) {
    return { deleted: 0, rowids: [], logEntriesRemoved: 0 };
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

    // Clean matching lines from log.jsonl (best-effort)
    const logEntriesRemoved = purgeLogEntries(matchContents);

    return { deleted, rowids, logEntriesRemoved };
  } finally {
    db.close();
  }
}

/**
 * Remove lines from log.jsonl whose content matches any of the given strings.
 *
 * Uses atomic write: writes filtered content to a temp file, then renames.
 * Matches on event.data.content (the raw capture content), not the assembled
 * search table content — task entries may use assembled content that differs.
 * This is acceptable: the rebuild exclusion (Change 2) is the hard guard;
 * log.jsonl cleanup is best-effort.
 *
 * @param matchContents - Content strings to filter out
 * @returns Number of lines removed
 */
function purgeLogEntries(matchContents: string[]): number {
  if (matchContents.length === 0) return 0;

  const logPath = join(getConfig().paths.data, "log.jsonl");
  const tmpPath = logPath + ".tmp";

  if (!existsSync(logPath)) return 0;

  try {
    // Clean up stale temp file from a prior crash
    if (existsSync(tmpPath)) {
      unlinkSync(tmpPath);
    }

    const lines = readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
    const filtered = lines.filter((line) => {
      try {
        const event = JSON.parse(line) as {
          data?: { content?: string; text?: string };
        };
        const content = event.data?.content || event.data?.text || "";
        return !matchContents.some((mc) => content.includes(mc));
      } catch {
        return true; // Keep unparseable lines
      }
    });

    writeFileSync(
      tmpPath,
      filtered.join("\n") + (filtered.length > 0 ? "\n" : ""),
      "utf-8",
    );
    renameSync(tmpPath, logPath);

    return lines.length - filtered.length;
  } catch (err) {
    // log.jsonl cleanup is best-effort — never fail the purge
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[purge] log.jsonl cleanup failed (${message})`);
    return 0;
  }
}
