/**
 * Atuin shell history integration
 *
 * Queries Atuin SQLite database directly for shell command history.
 * Filters sensitive commands containing passwords, tokens, secrets, API keys.
 */

import { existsSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";

export interface AtuinSearchResult {
  source: string;
  title: string;
  content: string;
  metadata: string;
  rank: number;
}

export interface AtuinSearchOptions {
  limit?: number;
  cwd?: string;
  exitCode?: number;
}

const ATUIN_DB_PATH = join(
  process.env.HOME ?? "",
  ".local",
  "share",
  "atuin",
  "history.db",
);

// Patterns that indicate sensitive data - exclude these commands
const SENSITIVE_PATTERNS = [
  "%--password%",
  "%--token%",
  "%--secret%",
  "%PASSWORD=%",
  "%TOKEN=%",
  "%SECRET=%",
  "%API_KEY=%",
  "%APIKEY=%",
  "%_KEY=%",
  "export %KEY%",
  "export %TOKEN%",
  "export %SECRET%",
  "export %PASSWORD%",
  "%X-API-Key:%",
  "%Authorization:%",
  "echo $%KEY%",
  "echo $%TOKEN%",
  "echo $%SECRET%",
];

interface AtuinRow {
  command: string;
  cwd: string;
  exit: number;
  duration: number;
  timestamp: number;
  hostname: string;
}

/**
 * Search Atuin shell history
 */
export function searchAtuin(
  query: string,
  options: AtuinSearchOptions = {},
): AtuinSearchResult[] {
  if (!existsSync(ATUIN_DB_PATH)) {
    throw new Error(
      `Atuin database not found at ${ATUIN_DB_PATH}. ` +
        "Install Atuin: https://atuin.sh",
    );
  }

  const db = new Database(ATUIN_DB_PATH, { readonly: true });
  const limit = options.limit ?? 20;

  try {
    // Build WHERE clause with sensitive data filtering
    const conditions = [
      "deleted_at IS NULL",
      "command LIKE ?",
      ...SENSITIVE_PATTERNS.map(() => "command NOT LIKE ?"),
    ];

    if (options.cwd) {
      conditions.push("cwd = ?");
    }

    if (options.exitCode !== undefined) {
      conditions.push("exit = ?");
    }

    const whereClause = conditions.join(" AND ");

    const sql = `
      SELECT command, cwd, exit, duration, timestamp, hostname
      FROM history
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    // Build parameters
    const params: (string | number)[] = [`%${query}%`, ...SENSITIVE_PATTERNS];

    if (options.cwd) {
      params.push(options.cwd);
    }

    if (options.exitCode !== undefined) {
      params.push(options.exitCode);
    }

    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as AtuinRow[];

    return rows.map((row, index) => {
      // Convert nanosecond timestamp to ISO date
      const timestampSec = Math.floor(row.timestamp / 1_000_000_000);
      const date = new Date(timestampSec * 1000);
      const dateStr = date.toISOString().split("T")[0];

      // Convert duration from nanoseconds to milliseconds
      const durationMs = Math.floor(row.duration / 1_000_000);

      // Build title: truncate command to 80 chars
      const title =
        row.command.length > 80
          ? `[shell] ${row.command.slice(0, 77)}...`
          : `[shell] ${row.command}`;

      // Normalize cwd
      const cwd = row.cwd === "unknown" ? "" : row.cwd;

      return {
        source: "atuin",
        title,
        content: row.command,
        metadata: JSON.stringify({
          command: row.command,
          cwd,
          exit_code: row.exit,
          duration_ms: durationMs,
          date: dateStr,
          hostname: row.hostname,
        }),
        rank: -index, // Simple ranking by recency
      };
    });
  } finally {
    db.close();
  }
}
