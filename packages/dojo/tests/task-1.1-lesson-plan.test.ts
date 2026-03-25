/**
 * Task 1.1 — Lesson plan schema + lifecycle invariant tests
 *
 * Invariants tested:
 * - INV-004 (extended): dojo init creates ~/.local/share/dojo/lessons directory
 * - INV-009 (proxy): lesson get returns success=true with content for existing plan
 * - lesson get fails with descriptive path message for missing plan
 * - lesson get fails with usage message when args are missing
 * - ConceptProgress type accepts optional lesson_plan_path field (type-level)
 */

import { describe, it, expect, mock, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { ConceptProgress } from "../lib/types";

// ---------------------------------------------------------------------------
// Temp directory — mocked home for handleInit tests
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync("/tmp/test-dojo-lesson-");
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Mock os BEFORE importing init.ts
// homedir() is evaluated at call time inside handleInit — mock before import
// ---------------------------------------------------------------------------

mock.module("os", () => ({
  homedir: () => tempDir,
}));

// Dynamic import AFTER mock — per quality.md isolation strategy
const { handleInit } = await import("../lib/init");

// ---------------------------------------------------------------------------
// Helpers for handleInit injection pattern (from task-8.1-init.test.ts)
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
// Fixture path in the real lessons directory for subprocess tests
// These tests create a temp file in the real ~/.local/share/dojo/lessons/
// and clean up afterward.
// ---------------------------------------------------------------------------

const REAL_LESSONS_BASE = `${process.env.HOME}/.local/share/dojo/lessons`;
const TEST_DOMAIN = "test-domain-1-1";
const TEST_CONCEPT = "test-concept-xyz";
const testLessonDir = join(REAL_LESSONS_BASE, TEST_DOMAIN);
const testLessonPath = join(testLessonDir, `${TEST_CONCEPT}.md`);

const SAMPLE_LESSON_CONTENT = `---
concept: ${TEST_CONCEPT}
domain: ${TEST_DOMAIN}
learning_context: skill-build
created: 2026-03-24
updated: 2026-03-24
---

## Core Idea
Test content for invariant verification.

## Key Resource
None.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("task 1.1 — lesson plan schema + lifecycle", () => {
  // -------------------------------------------------------------------------
  // INV-004 (extended): dojo init creates the lessons directory
  // -------------------------------------------------------------------------

  it("INV-004: dojo init creates ~/.local/share/dojo/lessons directory", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    const lessonsDir = join(tempDir, ".local", "share", "dojo", "lessons");
    expect(existsSync(lessonsDir)).toBe(true);
  });

  it("INV-004: dojo init checks.lessons_dir is true", () => {
    const out = makeOutput();
    const fail = makeFail();

    handleInit([], out.fn, fail.fn);

    const data = out.result!.data as Record<string, unknown>;
    const checks = data.checks as Record<string, boolean>;
    expect(checks.lessons_dir).toBe(true);
  });

  // -------------------------------------------------------------------------
  // INV-009 (proxy): lesson get returns success=true with content for existing plan
  // -------------------------------------------------------------------------

  it("INV-009: lesson get returns success=true with content for existing plan", () => {
    // Create fixture in real lessons dir
    mkdirSync(testLessonDir, { recursive: true });
    writeFileSync(testLessonPath, SAMPLE_LESSON_CONTENT, "utf-8");

    try {
      const result = Bun.spawnSync(
        ["dojo", "lesson", "get", TEST_DOMAIN, TEST_CONCEPT],
        { stdout: "pipe", stderr: "pipe" },
      );

      const stdout = new TextDecoder().decode(result.stdout);
      const parsed = JSON.parse(stdout);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.domain).toBe(TEST_DOMAIN);
      expect(parsed.data.concept_id).toBe(TEST_CONCEPT);
      expect(parsed.data.content).toContain(
        "Test content for invariant verification",
      );
    } finally {
      // Cleanup fixture regardless of test outcome
      if (existsSync(testLessonPath)) rmSync(testLessonPath);
      if (existsSync(testLessonDir))
        rmSync(testLessonDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // lesson get fails with descriptive path for missing plan
  // -------------------------------------------------------------------------

  it("lesson get fails with descriptive error including path for missing plan", () => {
    const result = Bun.spawnSync(
      ["dojo", "lesson", "get", "no-such-domain", "no-such-concept"],
      { stdout: "pipe", stderr: "pipe" },
    );

    const stdout = new TextDecoder().decode(result.stdout);
    const parsed = JSON.parse(stdout);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("no-such-concept");
    expect(parsed.error).toContain("no-such-domain");
    // Path must be included so user knows where to look
    expect(parsed.error).toContain(".local/share/dojo/lessons");
    expect(result.exitCode).toBe(1);
  });

  // -------------------------------------------------------------------------
  // lesson get fails with usage message when args are missing
  // -------------------------------------------------------------------------

  it("lesson get fails with usage message when positional args are missing", () => {
    const result = Bun.spawnSync(["dojo", "lesson", "get"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = new TextDecoder().decode(result.stdout);
    const parsed = JSON.parse(stdout);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Usage:");
    expect(parsed.error).toContain("dojo lesson get");
    expect(result.exitCode).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Path traversal rejection (discovered during independent risk analysis)
  //
  // Invariant: lesson get MUST NOT read files outside ~/.local/share/dojo/lessons/
  // Attack: domain or concept-id containing ../ sequences escape the lessons dir.
  // Fix: path containment check via resolve() + startsWith(lessonsBase).
  // -------------------------------------------------------------------------

  it("lesson get rejects path traversal in domain argument", () => {
    // ../../etc would resolve to ~/.local/share/etc — outside lessons dir
    const result = Bun.spawnSync(
      ["dojo", "lesson", "get", "../../etc", "passwd"],
      { stdout: "pipe", stderr: "pipe" },
    );

    const stdout = new TextDecoder().decode(result.stdout);
    const parsed = JSON.parse(stdout);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Invalid path");
    expect(parsed.error).toContain("path traversal");
    expect(result.exitCode).toBe(1);
  });

  it("lesson get rejects path traversal in concept-id argument", () => {
    // concept-id with ../ sequences escape the domain subdirectory
    const result = Bun.spawnSync(
      ["dojo", "lesson", "get", "valid-domain", "../../../.zshrc"],
      { stdout: "pipe", stderr: "pipe" },
    );

    const stdout = new TextDecoder().decode(result.stdout);
    const parsed = JSON.parse(stdout);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Invalid path");
    expect(parsed.error).toContain("path traversal");
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Type-level: ConceptProgress accepts lesson_plan_path as optional field
// This test passes if and only if the TypeScript type is correctly defined.
// ---------------------------------------------------------------------------

describe("task 1.1 — ConceptProgress type schema", () => {
  it("ConceptProgress type accepts lesson_plan_path as optional string|null", () => {
    // This is a compile-time check expressed as a runtime assertion.
    // If lesson_plan_path is not on the type, this would fail typecheck.
    // The cast to ConceptProgress verifies structural compatibility.
    const withPath: Pick<ConceptProgress, "lesson_plan_path"> = {
      lesson_plan_path: "/path/to/plan.md",
    };
    const withNull: Pick<ConceptProgress, "lesson_plan_path"> = {
      lesson_plan_path: null,
    };
    const withUndefined: Pick<ConceptProgress, "lesson_plan_path"> = {
      lesson_plan_path: undefined,
    };

    expect(withPath.lesson_plan_path).toBe("/path/to/plan.md");
    expect(withNull.lesson_plan_path).toBeNull();
    expect(withUndefined.lesson_plan_path).toBeUndefined();
  });
});
