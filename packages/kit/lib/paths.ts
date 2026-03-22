/**
 * lib/paths.ts — XDG path resolution and install location mapping
 */

import { homedir } from "os";
import { join } from "path";
import type { ResourceType, KitConfig } from "./types";

const home = homedir();

/** XDG base directories for Kit */
export const xdg = {
  config: join(home, ".config", "kit"),
  data: join(home, ".local", "share", "kit"),
  cache: join(home, ".cache", "kit"),
} as const;

/** Resolved file paths */
export const files = {
  config: join(xdg.config, "config.toml"),
  state: join(xdg.data, "state.yaml"),
  catalogDir: join(xdg.cache, "catalog"),
  catalogFile: join(xdg.cache, "catalog", "kit-catalog.yaml"),
} as const;

/** Default install locations by resource type */
const defaultInstallDirs: Record<ResourceType, string> = {
  skill: join(home, ".claude", "skills"),
  command: join(home, ".claude", "commands"),
  script: join(home, ".local", "bin"),
  prompt: join(home, ".claude", "commands"),
  agent: join(home, ".config", "sable", "agents"),
};

/**
 * Get the install path for a resource, respecting config overrides.
 * Skills and agents get subdirectories; commands/prompts get files.
 */
export function getInstallPath(
  name: string,
  type: ResourceType,
  config?: KitConfig,
  dir?: string,
): string {
  if (dir) {
    // Project-scoped install
    switch (type) {
      case "skill":
        return join(dir, ".claude", "skills", name);
      case "command":
        return join(dir, ".claude", "commands", `${name}.md`);
      case "prompt":
        return join(dir, ".claude", "commands", `${name}.md`);
      case "script":
        return join(dir, "bin", name);
      case "agent":
        return join(dir, ".config", "sable", "agents", `${name}.yaml`);
    }
  }

  const base = config?.paths?.[`${type}s` as keyof NonNullable<KitConfig["paths"]>]
    ?? defaultInstallDirs[type];

  switch (type) {
    case "skill":
      return join(base, name);
    case "command":
      return join(base, `${name}.md`);
    case "prompt":
      return join(base, `${name}.md`);
    case "script":
      return join(base, name);
    case "agent":
      return join(base, `${name}.yaml`);
  }
}
