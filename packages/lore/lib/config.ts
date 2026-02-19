/**
 * lib/config.ts - TOML configuration reader
 *
 * Reads ~/.config/lore/config.toml, validates required fields,
 * resolves ~ to absolute paths, and caches the result.
 *
 * Usage:
 *   import { getConfig } from "./config";
 *   const config = getConfig();
 *   console.log(config.paths.data);      // ~/.local/share/lore
 *   console.log(config.database.sqlite);  // ~/.local/share/lore/lore.db
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { parse as parseToml } from "@iarna/toml";

export interface LoreConfig {
  paths: {
    data: string;
    obsidian: string;
    explorations: string;
    blogs: string;
    projects: string;
    personal: string;
    session_events?: string;
    sable_events?: string;
    flux?: string;
    flux_projects?: string;
    blog_url?: string;
  };
  database: {
    sqlite: string;
    custom_sqlite?: string;
  };
}

let cachedConfig: LoreConfig | null = null;

/**
 * Resolve ~ to the user's home directory
 */
function resolvePath(path: string): string {
  return path.replace(/^~/, homedir());
}

/**
 * Read and parse the TOML config, validate required fields,
 * resolve paths, and cache the result.
 */
export function getConfig(): LoreConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = `${homedir()}/.config/lore/config.toml`;

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(
      `Config file not found: ${configPath}\n` +
        `Create it with [paths] and [database] sections.\n` +
        `See: https://github.com/nickpending/llmcli-tools/tree/main/packages/lore#configuration`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config.toml: ${message}`);
  }

  // Validate required sections
  if (!parsed.paths || typeof parsed.paths !== "object") {
    throw new Error("Invalid config: missing [paths] section in config.toml");
  }
  if (!parsed.database || typeof parsed.database !== "object") {
    throw new Error(
      "Invalid config: missing [database] section in config.toml",
    );
  }

  const paths = parsed.paths as Record<string, unknown>;
  const database = parsed.database as Record<string, unknown>;

  // Validate required path fields
  const requiredPaths = [
    "data",
    "obsidian",
    "explorations",
    "blogs",
    "projects",
    "personal",
  ];
  for (const field of requiredPaths) {
    if (typeof paths[field] !== "string") {
      throw new Error(
        `Invalid config: paths.${field} is missing or not a string`,
      );
    }
  }

  if (typeof database.sqlite !== "string") {
    throw new Error(
      "Invalid config: database.sqlite is missing or not a string",
    );
  }

  // Build config with resolved paths
  cachedConfig = {
    paths: {
      data: resolvePath(paths.data as string),
      obsidian: resolvePath(paths.obsidian as string),
      explorations: resolvePath(paths.explorations as string),
      blogs: resolvePath(paths.blogs as string),
      projects: resolvePath(paths.projects as string),
      personal: resolvePath(paths.personal as string),
      session_events:
        typeof paths.session_events === "string"
          ? resolvePath(paths.session_events)
          : undefined,
      sable_events:
        typeof paths.sable_events === "string"
          ? resolvePath(paths.sable_events)
          : undefined,
      flux:
        typeof paths.flux === "string" ? resolvePath(paths.flux) : undefined,
      flux_projects:
        typeof paths.flux_projects === "string"
          ? resolvePath(paths.flux_projects)
          : undefined,
      blog_url: typeof paths.blog_url === "string" ? paths.blog_url : undefined,
    },
    database: {
      sqlite: resolvePath(database.sqlite as string),
      custom_sqlite:
        typeof database.custom_sqlite === "string"
          ? resolvePath(database.custom_sqlite)
          : undefined,
    },
  };

  return cachedConfig;
}
