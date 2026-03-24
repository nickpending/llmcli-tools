/**
 * lib/catalog.ts — YAML catalog parser and writer
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import yaml from "js-yaml";
import { files } from "./paths";
import type { Catalog, CatalogEntry, ResourceType } from "./types";

const VALID_TYPES: ResourceType[] = ["skill", "command", "script", "agent"];

function validateEntry(entry: unknown, index: number): CatalogEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Catalog entry ${index}: not an object`);
  }

  const e = entry as Record<string, unknown>;

  if (typeof e.name !== "string" || !e.name) {
    throw new Error(`Catalog entry ${index}: missing or invalid 'name'`);
  }
  if (typeof e.repo !== "string" || !e.repo) {
    throw new Error(
      `Catalog entry ${index} (${e.name}): missing or invalid 'repo'`,
    );
  }
  if (typeof e.path !== "string" || !e.path) {
    throw new Error(
      `Catalog entry ${index} (${e.name}): missing or invalid 'path'`,
    );
  }
  if (!VALID_TYPES.includes(e.type as ResourceType)) {
    throw new Error(
      `Catalog entry ${index} (${e.name}): invalid type '${e.type}'. Must be one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  return {
    name: e.name,
    repo: e.repo,
    path: e.path,
    type: e.type as ResourceType,
    domain: Array.isArray(e.domain) ? e.domain.map(String) : [],
    tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
    description: typeof e.description === "string" ? e.description : undefined,
  };
}

/** Load and validate catalog from YAML file */
export function loadCatalog(path?: string): Catalog {
  const catalogPath = path ?? files.catalogFile;

  if (!existsSync(catalogPath)) {
    return { entries: [] };
  }

  const raw = readFileSync(catalogPath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, unknown[]> | null;

  if (!parsed || typeof parsed !== "object") {
    return { entries: [] };
  }

  const entries: CatalogEntry[] = [];
  let index = 0;

  // Catalog can be organized by type sections or a flat entries array
  if (Array.isArray(parsed.entries)) {
    for (const item of parsed.entries) {
      entries.push(validateEntry(item, index++));
    }
  } else {
    // Sections by type: skills:, commands:, agents:, scripts:
    for (const section of Object.keys(parsed)) {
      const items = parsed[section];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        entries.push(validateEntry(item, index++));
      }
    }
  }

  return { entries };
}

/** Save catalog to YAML file, organized by type sections */
export function saveCatalog(catalog: Catalog, path?: string): void {
  const catalogPath = path ?? files.catalogFile;

  // Group entries by type
  const sections: Record<string, CatalogEntry[]> = {};
  for (const entry of catalog.entries) {
    const section = entry.type + "s"; // skill -> skills
    sections[section] = sections[section] || [];
    sections[section].push(entry);
  }

  const output = yaml.dump(sections, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: true,
  });

  writeFileSync(catalogPath, output, "utf-8");
}

/** Find an entry by name */
export function findEntry(
  catalog: Catalog,
  name: string,
): CatalogEntry | undefined {
  return catalog.entries.find((e) => e.name === name);
}

/** Add an entry to the catalog (does not save) */
export function addEntry(catalog: Catalog, entry: CatalogEntry): Catalog {
  if (findEntry(catalog, entry.name)) {
    throw new Error(`Entry '${entry.name}' already exists in catalog`);
  }
  return { entries: [...catalog.entries, entry] };
}

/** Remove an entry from the catalog (does not save) */
export function removeEntry(catalog: Catalog, name: string): Catalog {
  const filtered = catalog.entries.filter((e) => e.name !== name);
  if (filtered.length === catalog.entries.length) {
    throw new Error(`Entry '${name}' not found in catalog`);
  }
  return { entries: filtered };
}
