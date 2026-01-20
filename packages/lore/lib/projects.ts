/**
 * lib/projects.ts - List all known projects across sources
 *
 * Queries distinct project values from metadata fields, handling
 * different field names per source type.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";

const PROJECT_FIELD: Record<string, string> = {
  commits: "project",
  sessions: "project",
  tasks: "project",
  captures: "context",
  teachings: "source",
};

function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
}

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
    const allProjects = new Set<string>();

    for (const [source, field] of Object.entries(PROJECT_FIELD)) {
      const stmt = db.prepare(`
        SELECT DISTINCT json_extract(metadata, '$.${field}') as proj
        FROM search
        WHERE source = ? AND json_extract(metadata, '$.${field}') IS NOT NULL
      `);
      const results = stmt.all(source) as { proj: string | null }[];

      for (const r of results) {
        if (r.proj) {
          allProjects.add(r.proj);
        }
      }
    }

    return Array.from(allProjects).sort();
  } finally {
    db.close();
  }
}
