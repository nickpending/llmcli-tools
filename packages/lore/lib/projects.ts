/**
 * lib/projects.ts - List all known projects across sources
 *
 * Queries distinct topic values from the topic column across
 * project-scoped sources.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { getDatabasePath } from "./db.js";

const PROJECT_SOURCES = [
  "commits",
  "sessions",
  "flux",
  "insights",
  "captures",
  "teachings",
  "learnings",
  "observations",
];

/**
 * Get all unique project names across sources
 *
 * @returns Sorted array of unique project names
 */
export function projects(): string[] {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    return [];
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    const placeholders = PROJECT_SOURCES.map(() => "?").join(", ");
    const stmt = db.prepare(`
      SELECT DISTINCT topic
      FROM search
      WHERE source IN (${placeholders})
        AND topic IS NOT NULL
        AND topic != ''
    `);
    const results = stmt.all(...PROJECT_SOURCES) as { topic: string }[];

    return results
      .map((r) => r.topic)
      .filter(Boolean)
      .sort();
  } finally {
    db.close();
  }
}
