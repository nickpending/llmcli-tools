/**
 * Task 3.1 — Coaching system prompt template and guards: structural and content validation
 *
 * These are markdown model-instruction files, not executable code.
 * Tests verify file existence, structure, and critical constraint content.
 *
 * Invariants tested:
 * - INV-005 (design-time): prompt-template.md has {{PERSONA_IDENTITY}} slot
 * - INV-006 (design-time): prompt-template.md has FRAMEWORK_CONTENT_EMBEDDED_HERE marker
 * - INV-007 (design-time): both files contain exit workflow instructions
 * - All 5 variable slots present in prompt-template.md
 * - Both HTML embedding markers present (framework and guards)
 * - All 5 guard sections present in guards.md
 * - Continuity guard handles empty/none/absent lore context (highest-stakes guard)
 * - Challenge quality guard has anti-pattern list (what/explain/define/describe/list)
 * - Exit instructions reference workflows/exit.md and signal words
 * - {{PERSONA_IDENTITY}} appears before session context (identity-first ordering)
 *
 * INV-005/006/007 runtime assertions (model behavior during live session) are manual.
 * Design-time structural checks here are the testable proxy.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const COACHING_DIR = `${PROJECT_ROOT}/skills/learn/coaching`;
const GUARDS_FILE = `${COACHING_DIR}/guards.md`;
const TEMPLATE_FILE = `${COACHING_DIR}/prompt-template.md`;

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// File existence
// ---------------------------------------------------------------------------

describe("File existence — task 3.1 coaching files", () => {
  it("guards.md and prompt-template.md both exist in coaching/", () => {
    expect(existsSync(GUARDS_FILE)).toBe(true);
    expect(existsSync(TEMPLATE_FILE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// INV-005 + all 5 variable slots in prompt-template.md
// ---------------------------------------------------------------------------

describe("Variable slots — prompt-template.md", () => {
  it("all 5 required variable slots are present in the template body", () => {
    const content = readFile(TEMPLATE_FILE);
    // These slots are the contract with Task 4.1 assembly logic.
    // A missing slot means assembly produces a broken system prompt.
    const missingSlots: string[] = [];
    for (const slot of [
      "{{PERSONA_IDENTITY}}",
      "{{DOMAIN_NAME}}",
      "{{LEARNING_CONTEXT}}",
      "{{CONCEPT_QUEUE}}",
      "{{LORE_CONTEXT}}",
    ]) {
      if (!content.includes(slot)) {
        missingSlots.push(slot);
      }
    }
    expect(missingSlots).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// INV-006 — HTML embedding markers for framework and guards
// ---------------------------------------------------------------------------

describe("Embedding markers — prompt-template.md", () => {
  it("FRAMEWORK_CONTENT_EMBEDDED_HERE marker is present as an HTML comment", () => {
    const content = readFile(TEMPLATE_FILE);
    // Task 4.1 reads this marker to know where to inline framework.md content.
    // If missing, the instructional skeleton never gets embedded.
    expect(content).toMatch(/<!--[^>]*FRAMEWORK_CONTENT_EMBEDDED_HERE/);
  });

  it("GUARDS_CONTENT_EMBEDDED_HERE marker is present as an HTML comment", () => {
    const content = readFile(TEMPLATE_FILE);
    // Task 4.1 reads this marker to know where to inline guards.md content.
    // If missing, behavioral guards are absent from the assembled system prompt.
    expect(content).toMatch(/<!--[^>]*GUARDS_CONTENT_EMBEDDED_HERE/);
  });
});

// ---------------------------------------------------------------------------
// Identity-first slot ordering (INV-005 structural proxy)
// ---------------------------------------------------------------------------

describe("Slot ordering — prompt-template.md", () => {
  it("{{PERSONA_IDENTITY}} appears before {{DOMAIN_NAME}} in the template body", () => {
    const content = readFile(TEMPLATE_FILE);
    // Persona identity must be established first — if it follows session context,
    // the model may anchor to the content before reading the identity instruction.
    const identityPos = content.indexOf("{{PERSONA_IDENTITY}}");
    const domainPos = content.indexOf("{{DOMAIN_NAME}}");
    expect(identityPos).toBeGreaterThan(-1);
    expect(domainPos).toBeGreaterThan(-1);
    expect(identityPos).toBeLessThan(domainPos);
  });
});

// ---------------------------------------------------------------------------
// All 5 guard sections in guards.md
// ---------------------------------------------------------------------------

describe("Guard sections — guards.md", () => {
  it("all 5 guard sections are present as H2 headings", () => {
    const content = readFile(GUARDS_FILE);
    const missingSections: string[] = [];
    for (const section of [
      "Identity Guard",
      "Continuity Guard",
      "Challenge Quality Guard",
      "Resource Fidelity Guard",
      "Exit Guard",
    ]) {
      if (!content.match(new RegExp(`##\\s+${section}`, "i"))) {
        missingSections.push(section);
      }
    }
    expect(missingSections).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Continuity guard — highest-stakes correctness requirement
// ---------------------------------------------------------------------------

describe("Continuity guard — guards.md", () => {
  it("explicitly names empty, 'none', and not-provided as cases where prior session references are forbidden", () => {
    const content = readFile(GUARDS_FILE);
    // Extract the Continuity Guard section
    const sectionMatch = content.match(
      /## Continuity Guard\n([\s\S]*?)(?=\n## |\s*$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![1];
    // Must handle both the empty string case and the literal "none" case
    expect(section).toMatch(/empty|is empty/i);
    expect(section).toMatch(/`?none`?/i);
    // Must prohibit fabricated continuity phrases
    expect(section).toMatch(
      /last time|previous session|before|prior|shared history/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Challenge quality guard — anti-pattern list prevents vague instruction
// ---------------------------------------------------------------------------

describe("Challenge quality guard — guards.md", () => {
  it("includes explicit anti-pattern list with what/explain/define/describe/list", () => {
    const content = readFile(GUARDS_FILE);
    const sectionMatch = content.match(
      /## Challenge Quality Guard\n([\s\S]*?)(?=\n## |\s*$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![1];
    // Anti-patterns must be named explicitly — vague "no recall questions" is not enough
    const missingAntiPatterns: string[] = [];
    for (const pattern of ["what", "explain", "define", "describe", "list"]) {
      if (!section.toLowerCase().includes(pattern)) {
        missingAntiPatterns.push(pattern);
      }
    }
    expect(missingAntiPatterns).toEqual([]);
    // Must mandate production tasks
    expect(section).toMatch(/write|build|design|construct|produce/i);
  });
});

// ---------------------------------------------------------------------------
// INV-007 — Exit instructions reference workflows/exit.md and signal words
// ---------------------------------------------------------------------------

describe("Exit instructions — prompt-template.md and guards.md", () => {
  it("prompt-template.md Exit Instructions section references workflows/exit.md and exit signal words", () => {
    const content = readFile(TEMPLATE_FILE);
    const sectionMatch = content.match(
      /## Exit Instructions\n([\s\S]*?)(?=\n---\n|\n## |\s*$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![1];
    // Must reference the exact path Task 4.1 and session.md use
    expect(section).toContain("workflows/exit.md");
    // Must name the trigger signals so the model knows when to act
    const missingSIgnals: string[] = [];
    for (const signal of ["done", "exit", "finished", "quit"]) {
      if (!section.toLowerCase().includes(signal)) {
        missingSIgnals.push(signal);
      }
    }
    expect(missingSIgnals).toEqual([]);
  });

  it("guards.md Exit Guard prohibits closing without running exit workflow", () => {
    const content = readFile(GUARDS_FILE);
    const sectionMatch = content.match(
      /## Exit Guard\n([\s\S]*?)(?=\n## |\s*$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![1];
    // Must reference the exit workflow file
    expect(section).toContain("workflows/exit.md");
    // Must prohibit skipping — state persistence is the critical invariant
    expect(section).toMatch(/do not close|not optional|Skipping/i);
  });
});
