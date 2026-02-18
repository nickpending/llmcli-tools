/**
 * lib/info.ts - Discovery command for indexed sources
 *
 * Shows what's indexed, counts per source, and last indexed timestamp.
 * Uses Bun's built-in SQLite for zero external dependencies.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";
import { projects as getProjects } from "./projects.js";

export interface SourceInfo {
  name: string;
  count: number;
}

export interface InfoOutput {
  sources: SourceInfo[];
  projects: string[];
  last_indexed: string;
  total_entries: number;
}

function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
}

/**
 * Get info about indexed sources
 *
 * @returns InfoOutput with sources, counts, and metadata
 * @throws Error if database doesn't exist
 */
export function info(): InfoOutput {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    // Return empty info if database doesn't exist
    return {
      sources: [],
      projects: [],
      last_indexed: new Date().toISOString(),
      total_entries: 0,
    };
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    // Get distinct sources with counts
    const sourcesStmt = db.prepare(`
      SELECT source as name, COUNT(*) as count
      FROM search
      GROUP BY source
      ORDER BY count DESC
    `);
    const sources = sourcesStmt.all() as SourceInfo[];

    // Get total entries
    const totalStmt = db.prepare(`SELECT COUNT(*) as total FROM search`);
    const totalResult = totalStmt.get() as { total: number };
    const total_entries = totalResult?.total ?? 0;

    // Get last indexed timestamp from column
    const tsStmt = db.prepare(`
      SELECT MAX(timestamp) as ts
      FROM search
      WHERE timestamp IS NOT NULL AND timestamp != ''
    `);
    const tsResult = tsStmt.get() as { ts: string | null };
    const last_indexed = tsResult?.ts ?? new Date().toISOString();

    return {
      sources,
      projects: getProjects(),
      last_indexed,
      total_entries,
    };
  } finally {
    db.close();
  }
}

/**
 * Format info output for human readability
 */
export function formatInfoHuman(data: InfoOutput): string {
  const lines: string[] = [
    "Lore Knowledge Index",
    "====================",
    "",
    `Total entries: ${data.total_entries.toLocaleString()}`,
    `Last indexed: ${data.last_indexed}`,
    "",
    "Sources:",
  ];

  for (const source of data.sources) {
    lines.push(
      `  ${source.name.padEnd(15)} ${source.count.toLocaleString().padStart(8)} entries`,
    );
  }

  if (data.projects.length > 0) {
    lines.push("");
    lines.push("Projects:");
    for (const project of data.projects) {
      lines.push(`  ${project}`);
    }
  }

  return lines.join("\n");
}
