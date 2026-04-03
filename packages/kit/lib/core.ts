/**
 * lib/core.ts — Kit core operations
 *
 * All business logic lives here. CLI is a thin wrapper.
 */

import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  statSync,
  chmodSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { execFileSync } from "child_process";
import { stringify } from "smol-toml";
import { xdg, files, getInstallPath } from "./paths";
import { getConfig } from "./config";
import {
  loadCatalog,
  saveCatalog,
  findEntry,
  addEntry,
  removeEntry,
  updateEntry,
} from "./catalog";
import {
  loadState,
  saveState,
  isInstalled,
  getInstalled,
  recordInstall,
  recordRemoval,
  recordSync,
} from "./state";
import type {
  ResourceType,
  CatalogEntry,
  InitResult,
  AddResult,
  UpdateOptions,
  UpdateResult,
  UseResult,
  RemoveResult,
  ListResult,
  ListOptions,
  GetResult,
  SearchResult,
  SyncResult,
  PushResult,
  StatusResult,
  CheckResult,
  CheckEntry,
} from "./types";

const VALID_TYPES: ResourceType[] = ["skill", "command", "tool", "agent"];

function git(args: string[], cwd?: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const message =
      err instanceof Error
        ? (err as any).stderr?.trim() || err.message
        : String(err);
    throw new Error(`git ${args[0]} failed: ${message}`);
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

function cloneAndVerifyPath(
  repo: string,
  path: string,
  label: string,
): { tmpDir: string; exists: boolean } {
  const tmpDir = join(xdg.cache, "tmp", `verify-${label}-${Date.now()}`);
  ensureDir(dirname(tmpDir));
  git(["clone", "--depth", "1", repo, tmpDir]);
  const sourcePath = join(tmpDir, path);
  return { tmpDir, exists: existsSync(sourcePath) };
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
      error:
        "No catalog repo specified. Pass a repo URL or set it in ~/.config/kit/config.toml",
    };
  }

  // Clone or update catalog
  if (existsSync(files.catalogDir)) {
    try {
      git(["pull", "--ff-only"], files.catalogDir);
    } catch {
      // If pull fails, re-clone
      rmSync(files.catalogDir, { recursive: true, force: true });
      git(["clone", repo, files.catalogDir]);
    }
  } else {
    git(["clone", repo, files.catalogDir]);
  }

  // Write config if repo was provided and differs
  if (catalogRepo && catalogRepo !== config.catalog.repo) {
    ensureDir(xdg.config);
    const configContent = stringify({ catalog: { repo: catalogRepo } });
    writeFileSync(files.config, configContent + "\n", "utf-8");
  }

  return {
    success: true,
    catalogPath: files.catalogDir,
  };
}

// ─── add ─────────────────────────────────────────────────────────────────────

export async function add(opts: {
  name: string;
  repo?: string;
  path: string;
  type: ResourceType;
  domain?: string[];
  tags?: string[];
  description?: string;
}): Promise<AddResult> {
  ensureInitialized();

  // Resolve repo: explicit arg > config source.repo
  const config = getConfig();
  const repo = opts.repo || config.source?.repo;
  if (!repo) {
    return {
      success: false,
      error:
        "No repo specified. Pass --repo or set [source] repo in ~/.config/kit/config.toml",
    };
  }

  if (!VALID_TYPES.includes(opts.type)) {
    return {
      success: false,
      error: `Invalid type '${opts.type}'. Must be: ${VALID_TYPES.join(", ")}`,
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(opts.name)) {
    return {
      success: false,
      error: `Invalid name '${opts.name}'. Must match [a-zA-Z0-9_-]+`,
    };
  }

  // Verify path exists in source repo before adding to catalog
  let tmpDir: string | undefined;
  try {
    const result = cloneAndVerifyPath(repo, opts.path, opts.name);
    tmpDir = result.tmpDir;
    if (!result.exists) {
      return {
        success: false,
        error: `Path '${opts.path}' not found in repo '${repo}'`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to verify path in repo: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  const catalog = loadCatalog();

  const entry: CatalogEntry = {
    name: opts.name,
    repo,
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
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Commit and push catalog changes
  try {
    git(["add", "kit-catalog.yaml"], files.catalogDir);
    git(["commit", "-m", `Add ${opts.name} (${opts.type})`], files.catalogDir);
    git(["push"], files.catalogDir);
  } catch {
    // Commit/push failure is non-fatal — catalog is updated locally
  }

  return { success: true, name: opts.name };
}

// ─── update ──────────────────────────────────────────────────────────────────

export async function update(
  name: string,
  opts: UpdateOptions,
): Promise<UpdateResult> {
  ensureInitialized();

  // Require at least one field to update
  if (
    opts.domain === undefined &&
    opts.tags === undefined &&
    opts.description === undefined
  ) {
    return {
      success: false,
      error:
        "No fields to update. Provide at least one of --domain, --tags, --description",
    };
  }

  const catalog = loadCatalog();

  try {
    const updated = updateEntry(catalog, name, opts);
    saveCatalog(updated);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Commit and push catalog changes
  try {
    git(["add", "kit-catalog.yaml"], files.catalogDir);
    git(["commit", "-m", `Update ${name} metadata`], files.catalogDir);
    git(["push"], files.catalogDir);
  } catch {
    // Commit/push failure is non-fatal — catalog is updated locally
  }

  return { success: true, name };
}

// ─── use ─────────────────────────────────────────────────────────────────────

export async function use(name: string, dir?: string): Promise<UseResult> {
  ensureInitialized();

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return {
      success: false,
      error: `Invalid name '${name}'. Must match [a-zA-Z0-9_-]+`,
    };
  }

  const catalog = loadCatalog();
  const entry = findEntry(catalog, name);

  if (!entry) {
    return {
      success: false,
      error: `Component '${name}' not found in catalog`,
    };
  }

  const config = getConfig();
  const installPath = getInstallPath(entry.name, entry.type, config, dir);

  // Clone the source repo to a temp location, then copy the component
  const tmpDir = join(xdg.cache, "tmp", `${name}-${Date.now()}`);

  try {
    ensureDir(dirname(tmpDir));
    git(["clone", "--depth", "1", entry.repo, tmpDir]);

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
    if (entry.type === "tool") {
      chmodSync(installPath, 0o755);
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

export async function remove(
  name: string,
  fromCatalog?: boolean,
): Promise<RemoveResult> {
  ensureInitialized();

  if (fromCatalog) {
    // Remove from catalog
    const catalog = loadCatalog();
    try {
      const updated = removeEntry(catalog, name);
      saveCatalog(updated);

      // Commit and push
      try {
        git(["add", "kit-catalog.yaml"], files.catalogDir);
        git(["commit", "-m", `Remove ${name}`], files.catalogDir);
        git(["push"], files.catalogDir);
      } catch {
        // Non-fatal
      }

      return { success: true, name, removed: "catalog" };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Remove local install
  const state = loadState();
  const installed = getInstalled(state, name);

  if (!installed) {
    return {
      success: false,
      error: `Component '${name}' is not installed on this device`,
    };
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
    entries = entries.filter((e) => opts.tags!.some((t) => e.tags.includes(t)));
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
    return {
      success: false,
      error: `Component '${name}' not found in catalog`,
    };
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
    git(["pull", "--ff-only"], files.catalogDir);
  } catch (err) {
    return {
      success: false,
      updated: 0,
      failed: 1,
      errors: [
        `Failed to update catalog: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const state = loadState();
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const succeeded: string[] = [];

  // Group installed components by source repo to clone each unique repo once
  const byRepo = new Map<string, typeof state.installed>();
  for (const inst of state.installed) {
    const group = byRepo.get(inst.sourceRepo) ?? [];
    group.push(inst);
    byRepo.set(inst.sourceRepo, group);
  }

  for (const [repo, components] of byRepo) {
    const tmpDir = join(xdg.cache, "tmp", `sync-${Date.now()}`);

    try {
      ensureDir(dirname(tmpDir));
      git(["clone", "--depth", "1", repo, tmpDir]);

      for (const inst of components) {
        try {
          const sourcePath = join(tmpDir, inst.sourcePath);
          if (!existsSync(sourcePath)) {
            errors.push(
              `${inst.name}: path '${inst.sourcePath}' not found in '${repo}'`,
            );
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

          if (inst.type === "tool") {
            chmodSync(inst.installPath, 0o755);
          }

          updated++;
          succeeded.push(inst.name);
        } catch (err) {
          errors.push(
            `${inst.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
          failed++;
        }
      }
    } catch (err) {
      // Clone failed — mark all components from this repo as failed
      for (const inst of components) {
        errors.push(
          `${inst.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        failed++;
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Update sync timestamps only for components that succeeded
  let updatedState = state;
  for (const name of succeeded) {
    updatedState = recordSync(updatedState, name);
  }
  saveState(updatedState);

  return {
    success: failed === 0,
    updated,
    failed,
    errors,
  };
}

// ─── push ────────────────────────────────────────────────────────────────────

export async function push(
  name: string,
  message?: string,
  force?: boolean,
): Promise<PushResult> {
  ensureInitialized();

  const state = loadState();
  const inst = getInstalled(state, name);

  if (!inst) {
    return {
      success: false,
      error: `Component '${name}' is not installed on this device`,
    };
  }

  if (!existsSync(inst.installPath)) {
    return {
      success: false,
      error: `Install path '${inst.installPath}' does not exist`,
    };
  }

  // Clone source repo, copy local changes in, commit and push
  const tmpDir = join(xdg.cache, "tmp", `push-${name}-${Date.now()}`);

  try {
    ensureDir(dirname(tmpDir));
    git(["clone", inst.sourceRepo, tmpDir]);

    const destPath = join(tmpDir, inst.sourcePath);

    // Safety: detect if source repo has been edited directly.
    // If source != installed, pushing would overwrite source edits.
    if (!force && existsSync(destPath)) {
      try {
        const isDir = statSync(destPath).isDirectory();
        execFileSync(
          "diff",
          isDir
            ? ["-rq", inst.installPath, destPath]
            : ["-q", inst.installPath, destPath],
          {
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      } catch {
        rmSync(tmpDir, { recursive: true, force: true });
        return {
          success: false,
          error: `Source repo version of '${name}' differs from installed copy. The source repo may have been edited directly. Run 'kit sync' to update your installed copy, or use 'kit push --force' to overwrite.`,
        };
      }
    }

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

    git(["add", "."], tmpDir);

    // Check if there are changes
    try {
      git(["diff", "--cached", "--quiet"], tmpDir);
      return { success: true, name, error: "No changes to push" };
    } catch {
      // There are changes — good
    }

    const commitMsg = message ?? `update(${name}): push local changes`;
    git(["commit", "-m", commitMsg], tmpDir);
    git(["push"], tmpDir);

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

// ─── check ───────────────────────────────────────────────────────────────────

export async function check(): Promise<CheckResult> {
  ensureInitialized();

  const catalog = loadCatalog();
  const healthy: CheckEntry[] = [];
  const broken: CheckEntry[] = [];
  const errors: string[] = [];

  // Group catalog entries by repo to clone each unique repo once
  const byRepo = new Map<string, CatalogEntry[]>();
  for (const entry of catalog.entries) {
    const group = byRepo.get(entry.repo) ?? [];
    group.push(entry);
    byRepo.set(entry.repo, group);
  }

  for (const [repo, entries] of byRepo) {
    const tmpDir = join(xdg.cache, "tmp", `check-${Date.now()}`);

    try {
      ensureDir(dirname(tmpDir));
      git(["clone", "--depth", "1", repo, tmpDir]);

      for (const entry of entries) {
        const sourcePath = join(tmpDir, entry.path);
        const checkEntry: CheckEntry = {
          name: entry.name,
          type: entry.type,
          repo: entry.repo,
          path: entry.path,
        };

        if (existsSync(sourcePath)) {
          healthy.push(checkEntry);
        } else {
          broken.push(checkEntry);
          errors.push(
            `${entry.name}: path '${entry.path}' not found in '${repo}'`,
          );
        }
      }
    } catch (err) {
      // Clone failed — mark all entries from this repo as broken
      for (const entry of entries) {
        broken.push({
          name: entry.name,
          type: entry.type,
          repo: entry.repo,
          path: entry.path,
        });
        errors.push(
          `${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return {
    success: broken.length === 0,
    healthy,
    broken,
    healthyCount: healthy.length,
    brokenCount: broken.length,
    errors,
  };
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
