/**
 * lib/config.ts — TOML configuration reader for Kit
 *
 * Reads ~/.config/kit/config.toml with catalog repo URL and optional path overrides.
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { parse } from "smol-toml";
import { files } from "./paths";
import type { KitConfig } from "./types";

let cachedConfig: KitConfig | null = null;

function resolvePath(path: string): string {
  return path.replace(/^~/, homedir());
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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
  const parsed = parse(raw);

  const catalog = parsed.catalog as Record<string, unknown> | undefined;
  const paths = parsed.paths as Record<string, unknown> | undefined;

  cachedConfig = {
    catalog: {
      repo: str(catalog?.repo) ?? "",
    },
    paths: paths
      ? {
          skills: str(paths.skills)
            ? resolvePath(str(paths.skills)!)
            : undefined,
          commands: str(paths.commands)
            ? resolvePath(str(paths.commands)!)
            : undefined,
          scripts: str(paths.scripts)
            ? resolvePath(str(paths.scripts)!)
            : undefined,
          agents: str(paths.agents)
            ? resolvePath(str(paths.agents)!)
            : undefined,
        }
      : undefined,
  };

  return cachedConfig;
}

/** Reset cached config (for testing) */
export function resetConfig(): void {
  cachedConfig = null;
}
