/**
 * lib/db.ts - Shared database utilities
 *
 * Centralizes SQLite setup and database access for both
 * semantic search and real-time indexing.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { getConfig } from "./config";

// Load custom SQLite from config to enable extension loading
// Must be called before any Database instances are created
const config = getConfig();
if (config.database.custom_sqlite) {
  if (!existsSync(config.database.custom_sqlite)) {
    throw new Error(
      `database.custom_sqlite path does not exist: ${config.database.custom_sqlite}`,
    );
  }
  Database.setCustomSQLite(config.database.custom_sqlite);
} else {
  throw new Error(
    "database.custom_sqlite not set in ~/.config/lore/config.toml.\n" +
      "Required for sqlite-vec extension loading.\n" +
      'macOS: custom_sqlite = "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib"',
  );
}

/**
 * Get the path to the lore database
 */
export function getDatabasePath(): string {
  return getConfig().database.sqlite;
}

/**
 * Open the lore database with sqlite-vec extension loaded
 * @param readonly - Open in readonly mode (default: false)
 */
export function openDatabase(readonly = false): Database {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  const db = new Database(dbPath, { readonly });

  // Load sqlite-vec extension
  const vecPath = process.env.SQLITE_VEC_PATH;
  if (!vecPath) {
    throw new Error(
      'SQLITE_VEC_PATH not set. Get path with: python3 -c "import sqlite_vec; print(sqlite_vec.loadable_path())"',
    );
  }

  db.loadExtension(vecPath);

  return db;
}

/**
 * Open the lore database without sqlite-vec (for FTS5-only operations)
 * @param readonly - Open in readonly mode (default: false)
 */
export function openDatabaseBasic(readonly = false): Database {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  return new Database(dbPath, { readonly });
}
