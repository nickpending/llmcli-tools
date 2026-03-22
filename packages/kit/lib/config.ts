/**
 * lib/config.ts — TOML configuration reader for Kit
 *
 * Reads ~/.config/kit/config.toml with catalog repo URL and optional path overrides.
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { files } from "./paths";
import type { KitConfig } from "./types";

let cachedConfig: KitConfig | null = null;

function resolvePath(path: string): string {
  return path.replace(/^~/, homedir());
}

/**
 * Minimal TOML parser — handles simple key=value, [sections], and quoted strings.
 * Good enough for Kit's flat config. No external deps needed.
 */
function parseSimpleToml(raw: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let currentSection = "";

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      result[currentSection] = result[currentSection] || {};
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*"(.*)"\s*$/);
    if (kvMatch && currentSection) {
      result[currentSection][kvMatch[1]] = kvMatch[2];
    }
  }

  return result;
}

/** Load and cache Kit config from config.toml. Returns defaults if file missing. */
export function getConfig(): KitConfig {
  if (cachedConfig) return cachedConfig;

  if (!existsSync(files.config)) {
    cachedConfig = {
      catalog: { repo: "" },
    };
    return cachedConfig;
  }

  const raw = readFileSync(files.config, "utf-8");
  const parsed = parseSimpleToml(raw);

  cachedConfig = {
    catalog: {
      repo: parsed.catalog?.repo ?? "",
    },
    paths: parsed.paths
      ? {
          skills: parsed.paths.skills ? resolvePath(parsed.paths.skills) : undefined,
          commands: parsed.paths.commands ? resolvePath(parsed.paths.commands) : undefined,
          scripts: parsed.paths.scripts ? resolvePath(parsed.paths.scripts) : undefined,
          prompts: parsed.paths.prompts ? resolvePath(parsed.paths.prompts) : undefined,
          agents: parsed.paths.agents ? resolvePath(parsed.paths.agents) : undefined,
        }
      : undefined,
  };

  return cachedConfig;
}

/** Reset cached config (for testing) */
export function resetConfig(): void {
  cachedConfig = null;
}
