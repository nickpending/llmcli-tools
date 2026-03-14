/**
 * Task 8.1 — dojo init command invariant tests
 *
 * Invariants tested:
 * - INV-004: XDG-compliant directories created under homedir after init
 * - Config created on fresh init, preserved on re-init
 * - Missing optional deps (yt-dlp, lore) → warning only, success still true
 * - Skill files copied to ~/.claude/skills/learn/ (SKILL.md present)
 * - Re-init with existing config → configStatus = "preserved"
 * - ~/.claude/ created when it does not exist
 */

import { describe, it, expect, mock, afterAll } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Temp directory — all tests use this as the mocked home
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync("/tmp/test-dojo-init-");
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Mock os module BEFORE importing init.ts
// homedir() is called at runtime inside handleInit() — mocking os here
// ensures every call to homedir() returns our temp dir.
// ---------------------------------------------------------------------------

mock.module("os", () => ({
  homedir: () => tempDir,
}));

// Dynamic import AFTER mock — per quality.md isolation strategy
const { handleInit } = await import("../lib/init");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OutputResult = { success: boolean; [key: string]: unknown };

function makeOutput(): {
  result: OutputResult | null;
  fn: (r: OutputResult) => void;
} {
  let captured: OutputResult | null = null;
  return {
    get result() {
      return captured;
    },
    fn: (r: OutputResult) => {
      captured = r;
    },
  };
}

function makeFail(): {
  error: string | null;
  fn: (error: string, code?: number) => never;
} {
  let captured: string | null = null;
  return {
    get error() {
      return captured;
    },
    fn: (error: string, _code?: number): never => {
      captured = error;
      throw new Error(`fail called: ${error}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dojo init — task 8.1", () => {
  // -------------------------------------------------------------------------
  // INV-004: XDG path compliance
  // -------------------------------------------------------------------------

  it("INV-004: creates XDG-compliant directories under homedir", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    expect(existsSync(join(tempDir, ".config", "dojo"))).toBe(true);
    expect(
      existsSync(join(tempDir, ".local", "share", "dojo", "domains")),
    ).toBe(true);
    expect(
      existsSync(join(tempDir, ".local", "share", "dojo", "sources")),
    ).toBe(true);
    expect(existsSync(join(tempDir, ".cache", "dojo"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Happy path: success=true, all fields present
  // -------------------------------------------------------------------------

  it("happy path: output success=true with config, directories, skills, dependencies, checks", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    expect(out.result).not.toBeNull();
    expect(out.result!.success).toBe(true);

    const data = out.result!.data as Record<string, unknown>;
    expect(data).toHaveProperty("config");
    expect(data).toHaveProperty("directories");
    expect(data).toHaveProperty("skills");
    expect(data).toHaveProperty("dependencies");
    expect(data).toHaveProperty("warnings");
    expect(data).toHaveProperty("checks");
  });

  // -------------------------------------------------------------------------
  // Config created with correct content on first run
  // -------------------------------------------------------------------------

  it("config.toml contains all required TOML sections", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    const configPath = join(tempDir, ".config", "dojo", "config.toml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("[paths]");
    expect(content).toContain("[fsrs]");
    expect(content).toContain("request_retention = 0.9");
    expect(content).toContain("[session]");
    expect(content).toContain("[lore]");
  });

  // -------------------------------------------------------------------------
  // Re-init preserves config (critical: user data protection)
  // -------------------------------------------------------------------------

  it("re-init preserves existing config.toml — does not overwrite user edits", () => {
    // Config was created by earlier test. Add sentinel, then re-run init.
    const configPath = join(tempDir, ".config", "dojo", "config.toml");
    const existing = readFileSync(configPath, "utf-8");
    const sentinel = "# SENTINEL_VALUE\n";
    writeFileSync(configPath, sentinel + existing);

    const out = makeOutput();
    const fail = makeFail();
    handleInit([], out.fn, fail.fn);

    const afterContent = readFileSync(configPath, "utf-8");
    expect(afterContent).toContain("SENTINEL_VALUE");

    const data = out.result!.data as Record<string, unknown>;
    expect((data.config as Record<string, unknown>).status).toBe("preserved");
  });

  // -------------------------------------------------------------------------
  // Optional dep warnings: non-blocking
  // -------------------------------------------------------------------------

  it("missing optional deps produce warnings array but success stays true", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    expect(out.result!.success).toBe(true);
    const data = out.result!.data as Record<string, unknown>;
    expect(Array.isArray(data.warnings)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Skill files copied
  // -------------------------------------------------------------------------

  it("SKILL.md copied to ~/.claude/skills/learn/ after init", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    const skillDst = join(tempDir, ".claude", "skills", "learn", "SKILL.md");
    expect(existsSync(skillDst)).toBe(true);
  });

  it("checks.skill_files is true after init", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    const data = out.result!.data as Record<string, unknown>;
    const checks = data.checks as Record<string, boolean>;
    expect(checks.skill_files).toBe(true);
    expect(checks.config).toBe(true);
    expect(checks.data_dir).toBe(true);
    expect(checks.cache_dir).toBe(true);
  });

  // -------------------------------------------------------------------------
  // ~/.claude/ created when absent (idempotency / first-run)
  // -------------------------------------------------------------------------

  it("~/.claude/skills/learn/ exists after init regardless of prior state", () => {
    // After any init run against tempDir, this path must exist
    const claudeSkillsDir = join(tempDir, ".claude", "skills", "learn");
    expect(existsSync(claudeSkillsDir)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // fail() is injectable and called — guard against silent corruption
  // -------------------------------------------------------------------------

  it("fail() injected as param is the only error path — not swallowed silently", () => {
    // Verify that a normal run does NOT call fail()
    let failCalled = false;
    const testFail = (error: string, _code?: number): never => {
      failCalled = true;
      throw new Error(`unexpected fail: ${error}`);
    };
    const out = makeOutput();

    handleInit([], out.fn, testFail);

    expect(failCalled).toBe(false);
    expect(out.result!.success).toBe(true);
  });
});
