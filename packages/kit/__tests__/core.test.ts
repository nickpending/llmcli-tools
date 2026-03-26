import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import yaml from "js-yaml";

// Temp directories for test isolation
const tmpRoot = join("/tmp", `kit-test-core-${process.pid}`);
const configDir = join(tmpRoot, "config");
const dataDir = join(tmpRoot, "data");
const cacheDir = join(tmpRoot, "cache");

// Mock paths module to use temp directories
vi.mock("../lib/paths", () => ({
  xdg: {
    config: configDir,
    data: dataDir,
    cache: cacheDir,
  },
  files: {
    config: join(configDir, "config.toml"),
    state: join(dataDir, "state.yaml"),
    catalogDir: join(cacheDir, "catalog"),
    catalogFile: join(cacheDir, "catalog", "kit-catalog.yaml"),
  },
  getInstallPath: (
    name: string,
    type: string,
    _config?: unknown,
    dir?: string,
  ): string => {
    const base = dir ?? tmpRoot;
    switch (type) {
      case "skill":
        return join(base, "skills", name);
      case "command":
        return join(base, "commands", `${name}.md`);
      case "script":
        return join(base, "bin", name);
      case "agent":
        return join(base, "agents", `${name}.yaml`);
      default:
        return join(base, name);
    }
  },
}));

// Dynamic imports after mocking
const { init, add, use, remove, list, get, search, sync, check, status } =
  await import("../lib/core");
const { resetConfig } = await import("../lib/config");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temp git repo with a sample skill directory */
function createSourceRepo(): string {
  const repoDir = join(tmpRoot, `source-repo-${Date.now()}`);
  mkdirSync(join(repoDir, "skills", "test-skill"), { recursive: true });
  mkdirSync(join(repoDir, "commands"), { recursive: true });
  writeFileSync(
    join(repoDir, "skills", "test-skill", "SKILL.md"),
    "# Test Skill\nA test skill for integration tests.",
  );
  writeFileSync(
    join(repoDir, "commands", "test-cmd.md"),
    "# Test Command\nA test command.",
  );
  execSync("git init", { cwd: repoDir, stdio: "pipe" });
  execSync("git add .", { cwd: repoDir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', {
    cwd: repoDir,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    },
  });
  return repoDir;
}

/** Create a temp catalog repo pointing to source repo */
function createCatalogRepo(sourceRepo: string): string {
  const catalogDir = join(tmpRoot, `catalog-repo-${Date.now()}`);
  mkdirSync(catalogDir, { recursive: true });

  const catalogYaml = yaml.dump({
    skills: [
      {
        name: "test-skill",
        repo: sourceRepo,
        path: "skills/test-skill",
        type: "skill",
        domain: ["testing"],
        tags: ["test", "integration"],
        description: "A test skill",
      },
    ],
    commands: [
      {
        name: "test-cmd",
        repo: sourceRepo,
        path: "commands/test-cmd.md",
        type: "command",
        domain: ["testing"],
        tags: ["test"],
        description: "A test command",
      },
    ],
  });

  writeFileSync(join(catalogDir, "kit-catalog.yaml"), catalogYaml);
  execSync("git init", { cwd: catalogDir, stdio: "pipe" });
  execSync("git add .", { cwd: catalogDir, stdio: "pipe" });
  execSync('git commit -m "Initial catalog"', {
    cwd: catalogDir,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    },
  });
  return catalogDir;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let sourceRepo: string;
let catalogRepo: string;

beforeEach(() => {
  mkdirSync(tmpRoot, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  sourceRepo = createSourceRepo();
  catalogRepo = createCatalogRepo(sourceRepo);
  resetConfig();
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  resetConfig();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("init", () => {
  it("clones catalog repo and creates directories", async () => {
    const result = await init(catalogRepo);
    expect(result.success).toBe(true);
    expect(result.catalogPath).toBe(join(cacheDir, "catalog"));
    expect(existsSync(join(cacheDir, "catalog", "kit-catalog.yaml"))).toBe(
      true,
    );
  });

  it("returns error when no repo specified and no config", async () => {
    const result = await init();
    expect(result.success).toBe(false);
    expect(result.error).toContain("No catalog repo specified");
  });
});

describe("add", () => {
  it("adds entry to catalog", async () => {
    await init(catalogRepo);
    const result = await add({
      name: "new-skill",
      repo: sourceRepo,
      path: "skills/test-skill",
      type: "skill",
      domain: ["testing"],
      tags: ["new"],
      description: "A new skill",
    });
    expect(result.success).toBe(true);
    expect(result.name).toBe("new-skill");

    // Verify catalog updated
    const catalogPath = join(cacheDir, "catalog", "kit-catalog.yaml");
    const raw = readFileSync(catalogPath, "utf-8");
    expect(raw).toContain("new-skill");
  });

  it("rejects invalid types", async () => {
    await init(catalogRepo);
    const result = await add({
      name: "bad",
      repo: sourceRepo,
      path: "skills/test",
      type: "invalid" as any,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid type");
  });
});

describe("use", () => {
  it("installs a skill from source repo", async () => {
    await init(catalogRepo);
    const result = await use("test-skill");
    expect(result.success).toBe(true);
    expect(result.name).toBe("test-skill");
    expect(result.type).toBe("skill");
    expect(result.installPath).toBeDefined();

    // Verify files were copied
    expect(existsSync(result.installPath!)).toBe(true);
  });

  it("returns error for unknown component", async () => {
    await init(catalogRepo);
    const result = await use("nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("remove", () => {
  it("removes installed component", async () => {
    await init(catalogRepo);
    await use("test-skill");

    const result = await remove("test-skill");
    expect(result.success).toBe(true);
    expect(result.removed).toBe("local");
  });

  it("removes entry from catalog with --from-catalog", async () => {
    await init(catalogRepo);
    const result = await remove("test-skill", true);
    expect(result.success).toBe(true);
    expect(result.removed).toBe("catalog");
  });

  it("returns error for uninstalled component", async () => {
    await init(catalogRepo);
    const result = await remove("nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not installed");
  });
});

describe("list", () => {
  it("returns catalog entries with installed indicator", async () => {
    await init(catalogRepo);
    const result = await list();
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.entries[0].installed).toBe(false);
  });

  it("filters by installed", async () => {
    await init(catalogRepo);
    await use("test-skill");

    const result = await list({ installed: true });
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.entries[0].name).toBe("test-skill");
    expect(result.entries[0].installed).toBe(true);
  });

  it("filters by type", async () => {
    await init(catalogRepo);
    const result = await list({ type: "command" });
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.entries[0].type).toBe("command");
  });
});

describe("get", () => {
  it("returns single entry details", async () => {
    await init(catalogRepo);
    const result = await get("test-skill");
    expect(result.success).toBe(true);
    expect(result.entry?.name).toBe("test-skill");
    expect(result.entry?.type).toBe("skill");
    expect(result.entry?.installed).toBe(false);
  });

  it("returns error for missing component", async () => {
    await init(catalogRepo);
    const result = await get("nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("search", () => {
  it("finds entries by keyword in name", async () => {
    await init(catalogRepo);
    const result = await search("test-skill");
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.entries.some((e) => e.name === "test-skill")).toBe(true);
  });

  it("finds entries by keyword in description", async () => {
    await init(catalogRepo);
    const result = await search("test command");
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("finds entries by tag", async () => {
    await init(catalogRepo);
    const result = await search("integration");
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});

describe("sync", () => {
  it("updates installed components from source repos", async () => {
    await init(catalogRepo);
    await use("test-skill");

    const result = await sync();
    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("groups clones by repo (both components from same repo)", async () => {
    await init(catalogRepo);
    await use("test-skill");
    await use("test-cmd");

    // Both components come from the same sourceRepo — sync should clone once
    const result = await sync();
    expect(result.success).toBe(true);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("succeeds with no installed components", async () => {
    await init(catalogRepo);
    const result = await sync();
    expect(result.success).toBe(true);
    expect(result.updated).toBe(0);
  });
});

describe("status", () => {
  it("reports uninitialized state", async () => {
    const result = await status();
    expect(result.success).toBe(true);
    expect(result.initialized).toBe(false);
    expect(result.installedCount).toBe(0);
  });

  it("reports initialized state with installed components", async () => {
    await init(catalogRepo);
    await use("test-skill");

    const result = await status();
    expect(result.success).toBe(true);
    expect(result.initialized).toBe(true);
    expect(result.installedCount).toBe(1);
    expect(result.entries[0].name).toBe("test-skill");
    expect(result.entries[0].exists).toBe(true);
  });
});

describe("add path validation", () => {
  it("rejects add when path does not exist in source repo", async () => {
    await init(catalogRepo);
    const result = await add({
      name: "bad-path",
      repo: sourceRepo,
      path: "skills/nonexistent",
      type: "skill",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found in repo");

    // Verify catalog was NOT updated
    const catalogPath = join(cacheDir, "catalog", "kit-catalog.yaml");
    const raw = readFileSync(catalogPath, "utf-8");
    expect(raw).not.toContain("bad-path");
  });

  it("accepts add when path exists in source repo", async () => {
    await init(catalogRepo);
    const result = await add({
      name: "valid-skill",
      repo: sourceRepo,
      path: "skills/test-skill",
      type: "skill",
    });
    expect(result.success).toBe(true);
    expect(result.name).toBe("valid-skill");
  });
});

describe("sync error messages", () => {
  it("includes repo URL in broken pointer error", async () => {
    await init(catalogRepo);
    await use("test-skill");

    // Break the source repo by removing the skill directory
    rmSync(join(sourceRepo, "skills", "test-skill"), {
      recursive: true,
      force: true,
    });
    execSync("git add . && git commit -m 'Remove skill'", {
      cwd: sourceRepo,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });

    const result = await sync();
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("test-skill");
    expect(result.errors[0]).toContain("skills/test-skill");
    expect(result.errors[0]).toContain(sourceRepo);
  });
});

describe("check", () => {
  it("reports all healthy when catalog paths are valid", async () => {
    await init(catalogRepo);
    const result = await check();
    expect(result.success).toBe(true);
    expect(result.healthyCount).toBe(2);
    expect(result.brokenCount).toBe(0);
    expect(result.healthy.length).toBe(2);
    expect(result.broken.length).toBe(0);
  });

  it("detects broken pointers in catalog", async () => {
    await init(catalogRepo);

    // Add an entry with a path that exists, then break it
    await add({
      name: "will-break",
      repo: sourceRepo,
      path: "commands/test-cmd.md",
      type: "command",
    });

    // Remove the file from source repo
    rmSync(join(sourceRepo, "commands", "test-cmd.md"));
    execSync("git add . && git commit -m 'Remove command'", {
      cwd: sourceRepo,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });

    const result = await check();
    expect(result.success).toBe(false);
    expect(result.brokenCount).toBeGreaterThanOrEqual(1);
    expect(result.broken.some((e) => e.name === "test-cmd")).toBe(true);
    expect(result.broken.some((e) => e.name === "will-break")).toBe(true);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes(sourceRepo))).toBe(true);
  });
});
