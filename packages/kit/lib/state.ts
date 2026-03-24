/**
 * lib/state.ts — Local install state management
 *
 * Tracks what's installed on this device in ~/.local/share/kit/state.yaml
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import yaml from "js-yaml";
import { files } from "./paths";
import type { KitState, InstalledEntry, ResourceType } from "./types";

/** Load local state, returns empty state if file doesn't exist */
export function loadState(): KitState {
  if (!existsSync(files.state)) {
    return { installed: [] };
  }

  const raw = readFileSync(files.state, "utf-8");
  const parsed = yaml.load(raw) as KitState | null;

  if (!parsed || !Array.isArray(parsed.installed)) {
    return { installed: [] };
  }

  return parsed;
}

/** Save state to disk */
export function saveState(state: KitState): void {
  const dir = dirname(files.state);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const output = yaml.dump(state, { lineWidth: 120, noRefs: true });
  writeFileSync(files.state, output, "utf-8");
}

/** Check if a component is installed */
export function isInstalled(state: KitState, name: string): boolean {
  return state.installed.some((e) => e.name === name);
}

/** Get installed entry by name */
export function getInstalled(state: KitState, name: string): InstalledEntry | undefined {
  return state.installed.find((e) => e.name === name);
}

/** Record an installation */
export function recordInstall(
  state: KitState,
  entry: {
    name: string;
    type: ResourceType;
    installPath: string;
    sourceRepo: string;
    sourcePath: string;
  },
): KitState {
  // Remove existing entry if re-installing
  const filtered = state.installed.filter((e) => e.name !== entry.name);

  return {
    installed: [
      ...filtered,
      {
        ...entry,
        installedAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      },
    ],
  };
}

/** Remove an installation record */
export function recordRemoval(state: KitState, name: string): KitState {
  return {
    installed: state.installed.filter((e) => e.name !== name),
  };
}

/** Update last sync timestamp */
export function recordSync(state: KitState, name: string): KitState {
  return {
    installed: state.installed.map((e) =>
      e.name === name ? { ...e, lastSync: new Date().toISOString() } : e,
    ),
  };
}
