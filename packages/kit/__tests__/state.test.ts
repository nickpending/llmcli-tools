import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { KitState, InstalledEntry } from "../lib/types";

// Mock the paths module to use temp directory
const tmpDir = join("/tmp", "kit-test-state");
const stateFile = join(tmpDir, "state.yaml");

vi.mock("../lib/paths", () => ({
  files: {
    state: stateFile,
    config: join(tmpDir, "config.toml"),
    catalogDir: join(tmpDir, "catalog"),
    catalogFile: join(tmpDir, "catalog", "kit-catalog.yaml"),
  },
  xdg: {
    config: tmpDir,
    data: tmpDir,
    cache: tmpDir,
  },
}));

const { loadState, saveState, isInstalled, getInstalled, recordInstall, recordRemoval, recordSync } = await import(
  "../lib/state"
);

const sampleInstalled: InstalledEntry = {
  name: "test-skill",
  type: "skill",
  installPath: "/home/user/.claude/skills/test-skill",
  sourceRepo: "https://github.com/user/repo",
  sourcePath: "skills/test-skill",
  installedAt: "2026-03-22T00:00:00.000Z",
  lastSync: "2026-03-22T00:00:00.000Z",
};

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadState", () => {
  it("returns empty state when file doesn't exist", () => {
    const state = loadState();
    expect(state.installed).toEqual([]);
  });
});

describe("saveState / loadState roundtrip", () => {
  it("saves and loads state correctly", () => {
    const state: KitState = { installed: [sampleInstalled] };
    saveState(state);
    const loaded = loadState();
    expect(loaded.installed).toHaveLength(1);
    expect(loaded.installed[0].name).toBe("test-skill");
  });
});

describe("isInstalled", () => {
  it("returns true for installed entries", () => {
    const state: KitState = { installed: [sampleInstalled] };
    expect(isInstalled(state, "test-skill")).toBe(true);
  });

  it("returns false for missing entries", () => {
    const state: KitState = { installed: [] };
    expect(isInstalled(state, "test-skill")).toBe(false);
  });
});

describe("getInstalled", () => {
  it("returns installed entry", () => {
    const state: KitState = { installed: [sampleInstalled] };
    expect(getInstalled(state, "test-skill")).toEqual(sampleInstalled);
  });
});

describe("recordInstall", () => {
  it("adds a new install record", () => {
    const state: KitState = { installed: [] };
    const updated = recordInstall(state, {
      name: "new-skill",
      type: "skill",
      installPath: "/path/to/skill",
      sourceRepo: "https://github.com/user/repo",
      sourcePath: "skills/new-skill",
    });
    expect(updated.installed).toHaveLength(1);
    expect(updated.installed[0].name).toBe("new-skill");
    expect(updated.installed[0].installedAt).toBeTruthy();
  });

  it("replaces existing entry on re-install", () => {
    const state: KitState = { installed: [sampleInstalled] };
    const updated = recordInstall(state, {
      name: "test-skill",
      type: "skill",
      installPath: "/new/path",
      sourceRepo: "https://github.com/user/repo",
      sourcePath: "skills/test-skill",
    });
    expect(updated.installed).toHaveLength(1);
    expect(updated.installed[0].installPath).toBe("/new/path");
  });
});

describe("recordRemoval", () => {
  it("removes an install record", () => {
    const state: KitState = { installed: [sampleInstalled] };
    const updated = recordRemoval(state, "test-skill");
    expect(updated.installed).toHaveLength(0);
  });
});

describe("recordSync", () => {
  it("updates lastSync timestamp", () => {
    const state: KitState = { installed: [sampleInstalled] };
    const updated = recordSync(state, "test-skill");
    expect(updated.installed[0].lastSync).not.toBe(sampleInstalled.lastSync);
  });
});
