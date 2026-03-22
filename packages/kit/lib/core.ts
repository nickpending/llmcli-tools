/**
 * lib/core.ts — Kit core operations
 *
 * All business logic lives here. CLI is a thin wrapper.
 */

import { existsSync, mkdirSync, rmSync, cpSync, statSync } from "fs";
import { dirname, join } from "path";
import { execSync } from "child_process";
import { xdg, files, getInstallPath } from "./paths";
import { getConfig } from "./config";
import { loadCatalog, saveCatalog, findEntry, addEntry, removeEntry } from "./catalog";
import { loadState, saveState, isInstalled, getInstalled, recordInstall, recordRemoval, recordSync } from "./state";
import type {
  ResourceType,
  CatalogEntry,
  InitResult,
  AddResult,
  UseResult,
  RemoveResult,
  ListResult,
  ListOptions,
  GetResult,
  SearchResult,
  SyncResult,
  PushResult,
  StatusResult,
} from "./types";

const VALID_TYPES: ResourceType[] = ["skill", "command", "script", "prompt", "agent"];

function git(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? (err as any).stderr?.trim() || err.message : String(err);
    throw new Error(`git ${args.split(" ")[0]} failed: ${message}`);
  }
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function ensureInitialized(): void {
  if (!existsSync(files.catalogDir)) {
    throw new Error("Kit not initialized. Run 'kit init' first.");
  }
}

// ─── init ────────────────────────────────────────────────────────────────────

export async function init(catalogRepo?: string): Promise<InitResult> {
  // Create XDG directories
  ensureDir(xdg.config);
  ensureDir(xdg.data);
  ensureDir(xdg.cache);

  const config = getConfig();
  const repo = catalogRepo ?? config.catalog.repo;

  if (!repo) {
    return {
      success: false,
      error: "No catalog repo specified. Pass a repo URL or set it in ~/.config/kit/config.toml",
    };
  }

  // Clone or update catalog
  if (existsSync(files.catalogDir)) {
    try {
      git("pull --ff-only", files.catalogDir);
    } catch {
      // If pull fails, re-clone
      rmSync(files.catalogDir, { recursive: true, force: true });
      git(`clone ${repo} ${files.catalogDir}`);
    }
  } else {
    git(`clone ${repo} ${files.catalogDir}`);
  }

  // Write config if repo was provided and differs
  if (catalogRepo && catalogRepo !== config.catalog.repo) {
    ensureDir(xdg.config);
    const configContent = `[catalog]\nrepo = "${catalogRepo}"\n`;
    const { writeFileSync } = await import("fs");
    writeFileSync(files.config, configContent, "utf-8");
  }

  return {
    success: true,
    catalogPath: files.catalogDir,
  };
}

// ─── add ─────────────────────────────────────────────────────────────────────

export async function add(opts: {
  name: string;
  repo: string;
  path: string;
  type: ResourceType;
  domain?: string[];
  tags?: string[];
  description?: string;
}): Promise<AddResult> {
  ensureInitialized();

  if (!VALID_TYPES.includes(opts.type)) {
    return { success: false, error: `Invalid type '${opts.type}'. Must be: ${VALID_TYPES.join(", ")}` };
  }

  const catalog = loadCatalog();

  const entry: CatalogEntry = {
    name: opts.name,
    repo: opts.repo,
    path: opts.path,
    type: opts.type,
    domain: opts.domain ?? [],
    tags: opts.tags ?? [],
    description: opts.description,
  };

  try {
    const updated = addEntry(catalog, entry);
    saveCatalog(updated);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Commit and push catalog changes
  try {
    git("add kit-catalog.yaml", files.catalogDir);
    git(`commit -m "Add ${opts.name} (${opts.type})"`, files.catalogDir);
    git("push", files.catalogDir);
  } catch {
    // Commit/push failure is non-fatal — catalog is updated locally
  }

  return { success: true, name: opts.name };
}

// ─── use ─────────────────────────────────────────────────────────────────────

export async function use(name: string, dir?: string): Promise<UseResult> {
  ensureInitialized();

  const catalog = loadCatalog();
  const entry = findEntry(catalog, name);

  if (!entry) {
    return { success: false, error: `Component '${name}' not found in catalog` };
  }

  const config = getConfig();
  const installPath = getInstallPath(entry.name, entry.type, config, dir);

  // Clone the source repo to a temp location, then copy the component
  const tmpDir = join(xdg.cache, "tmp", `${name}-${Date.now()}`);

  try {
    ensureDir(dirname(tmpDir));
    git(`clone --depth 1 ${entry.repo} ${tmpDir}`);

    const sourcePath = join(tmpDir, entry.path);
    if (!existsSync(sourcePath)) {
      return {
        success: false,
        error: `Path '${entry.path}' not found in repo '${entry.repo}'`,
      };
    }

    // Install: copy source to install location
    ensureDir(dirname(installPath));

    const sourceIsDir = statSync(sourcePath).isDirectory();
    if (sourceIsDir) {
      cpSync(sourcePath, installPath, { recursive: true });
    } else {
      cpSync(sourcePath, installPath);
    }

    // Make scripts executable
    if (entry.type === "script") {
      execSync(`chmod +x "${installPath}"`, { stdio: "pipe" });
    }

    // Update state
    const state = loadState();
    const updated = recordInstall(state, {
      name: entry.name,
      type: entry.type,
      installPath,
      sourceRepo: entry.repo,
      sourcePath: entry.path,
    });
    saveState(updated);

    return {
      success: true,
      name: entry.name,
      type: entry.type,
      installPath,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Cleanup temp
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── remove ──────────────────────────────────────────────────────────────────

export async function remove(name: string, fromCatalog?: boolean): Promise<RemoveResult> {
  ensureInitialized();

  if (fromCatalog) {
    // Remove from catalog
    const catalog = loadCatalog();
    try {
      const updated = removeEntry(catalog, name);
      saveCatalog(updated);

      // Commit and push
      try {
        git("add kit-catalog.yaml", files.catalogDir);
        git(`commit -m "Remove ${name}"`, files.catalogDir);
        git("push", files.catalogDir);
      } catch {
        // Non-fatal
      }

      return { success: true, name, removed: "catalog" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Remove local install
  const state = loadState();
  const installed = getInstalled(state, name);

  if (!installed) {
    return { success: false, error: `Component '${name}' is not installed on this device` };
  }

  // Delete the installed files
  if (existsSync(installed.installPath)) {
    rmSync(installed.installPath, { recursive: true, force: true });
  }

  // Update state
  const updated = recordRemoval(state, name);
  saveState(updated);

  return { success: true, name, removed: "local" };
}

// ─── list ────────────────────────────────────────────────────────────────────

export async function list(opts?: ListOptions): Promise<ListResult> {
  ensureInitialized();

  const catalog = loadCatalog();
  const state = loadState();

  let entries = catalog.entries.map((e) => {
    const inst = getInstalled(state, e.name);
    return {
      ...e,
      installed: !!inst,
      installPath: inst?.installPath,
    };
  });

  // Apply filters
  if (opts?.installed) {
    entries = entries.filter((e) => e.installed);
  }
  if (opts?.available) {
    entries = entries.filter((e) => !e.installed);
  }
  if (opts?.type) {
    entries = entries.filter((e) => e.type === opts.type);
  }
  if (opts?.domain) {
    entries = entries.filter((e) => e.domain.includes(opts.domain!));
  }
  if (opts?.tags?.length) {
    entries = entries.filter((e) =>
      opts.tags!.some((t) => e.tags.includes(t)),
    );
  }

  return {
    success: true,
    entries,
    count: entries.length,
  };
}

// ─── get ─────────────────────────────────────────────────────────────────────

export async function get(name: string): Promise<GetResult> {
  ensureInitialized();

  const catalog = loadCatalog();
  const entry = findEntry(catalog, name);

  if (!entry) {
    return { success: false, error: `Component '${name}' not found in catalog` };
  }

  const state = loadState();
  const inst = getInstalled(state, name);

  return {
    success: true,
    entry: {
      ...entry,
      installed: !!inst,
      installPath: inst?.installPath,
    },
  };
}

// ─── search ──────────────────────────────────────────────────────────────────

export async function search(query: string): Promise<SearchResult> {
  ensureInitialized();

  const catalog = loadCatalog();
  const state = loadState();
  const q = query.toLowerCase();

  const entries = catalog.entries
    .filter((e) => {
      return (
        e.name.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        e.domain.some((d) => d.toLowerCase().includes(q)) ||
        e.type.toLowerCase().includes(q)
      );
    })
    .map((e) => ({
      ...e,
      installed: isInstalled(state, e.name),
    }));

  return {
    success: true,
    entries,
    count: entries.length,
    query,
  };
}

// ─── sync ────────────────────────────────────────────────────────────────────

export async function sync(): Promise<SyncResult> {
  ensureInitialized();

  // Pull latest catalog
  try {
    git("pull --ff-only", files.catalogDir);
  } catch (err) {
    return {
      success: false,
      updated: 0,
      unchanged: 0,
      failed: 1,
      errors: [`Failed to update catalog: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const state = loadState();
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const errors: string[] = [];

  // Update each installed component
  for (const inst of state.installed) {
    const tmpDir = join(xdg.cache, "tmp", `sync-${inst.name}-${Date.now()}`);

    try {
      ensureDir(dirname(tmpDir));
      git(`clone --depth 1 ${inst.sourceRepo} ${tmpDir}`);

      const sourcePath = join(tmpDir, inst.sourcePath);
      if (!existsSync(sourcePath)) {
        errors.push(`${inst.name}: source path '${inst.sourcePath}' not found in repo`);
        failed++;
        continue;
      }

      // Replace installed files
      if (existsSync(inst.installPath)) {
        rmSync(inst.installPath, { recursive: true, force: true });
      }
      ensureDir(dirname(inst.installPath));

      const sourceIsDir = statSync(sourcePath).isDirectory();
      if (sourceIsDir) {
        cpSync(sourcePath, inst.installPath, { recursive: true });
      } else {
        cpSync(sourcePath, inst.installPath);
      }

      if (inst.type === "script") {
        execSync(`chmod +x "${inst.installPath}"`, { stdio: "pipe" });
      }

      updated++;
    } catch (err) {
      errors.push(`${inst.name}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Update sync timestamps
  let updatedState = state;
  for (const inst of state.installed) {
    updatedState = recordSync(updatedState, inst.name);
  }
  saveState(updatedState);

  return {
    success: failed === 0,
    updated,
    unchanged,
    failed,
    errors,
  };
}

// ─── push ────────────────────────────────────────────────────────────────────

export async function push(name: string): Promise<PushResult> {
  ensureInitialized();

  const state = loadState();
  const inst = getInstalled(state, name);

  if (!inst) {
    return { success: false, error: `Component '${name}' is not installed on this device` };
  }

  if (!existsSync(inst.installPath)) {
    return { success: false, error: `Install path '${inst.installPath}' does not exist` };
  }

  // Clone source repo, copy local changes in, commit and push
  const tmpDir = join(xdg.cache, "tmp", `push-${name}-${Date.now()}`);

  try {
    ensureDir(dirname(tmpDir));
    git(`clone ${inst.sourceRepo} ${tmpDir}`);

    const destPath = join(tmpDir, inst.sourcePath);

    // Replace source with local version
    if (existsSync(destPath)) {
      rmSync(destPath, { recursive: true, force: true });
    }
    ensureDir(dirname(destPath));

    const sourceIsDir = statSync(inst.installPath).isDirectory();
    if (sourceIsDir) {
      cpSync(inst.installPath, destPath, { recursive: true });
    } else {
      cpSync(inst.installPath, destPath);
    }

    git("add .", tmpDir);

    // Check if there are changes
    try {
      git("diff --cached --quiet", tmpDir);
      return { success: true, name, error: "No changes to push" };
    } catch {
      // There are changes — good
    }

    git(`commit -m "Update ${name} via kit push"`, tmpDir);
    git("push", tmpDir);

    return { success: true, name };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── status ──────────────────────────────────────────────────────────────────

export async function status(): Promise<StatusResult> {
  const initialized = existsSync(files.catalogDir);
  const config = getConfig();
  const state = initialized ? loadState() : { installed: [] };

  const entries = state.installed.map((inst) => ({
    name: inst.name,
    type: inst.type,
    installPath: inst.installPath,
    lastSync: inst.lastSync,
    exists: existsSync(inst.installPath),
  }));

  return {
    success: true,
    initialized,
    catalogRepo: config.catalog.repo || undefined,
    installedCount: state.installed.length,
    entries,
  };
}
