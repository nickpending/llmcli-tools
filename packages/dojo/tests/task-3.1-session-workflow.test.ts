/**
 * Task 3.1 — Coaching Session Workflow: structural and content validation
 *
 * These are markdown model-instruction files, not executable code.
 * Tests verify file existence, structure, and critical constraint documentation.
 *
 * Invariants tested:
 * - session.md exists at the correct project path
 * - YAML front matter has name, description, and trigger
 * - All 5 phases present (Present, Challenge, Evaluate, Adjust, Bridge)
 * - Pre-session checklist: domain check, get-due, get-ready, queue build, persona load, lore enrichment
 * - State boundary prohibition: no dojo progress update or dojo session record during session
 * - Persona mandate: persona governs character, workflow governs structure
 * - In-session state tracking: outcome (nailed/struggled/partial), new concept detection via state === 0
 * - Context adaptation table covers all 4 contexts (Sprint, Skill-Build, Problem-Solve, Deep Mastery)
 * - Confusion pair handling with comparison exercise
 * - Empty queue handling present
 * - Session end handoff to exit.md
 * - Error handling table covers domain-not-found and get-due failure
 *
 * INV-001 (state file schema integrity) and INV-002 (FSRS card validity) are runtime
 * invariants requiring a live dojo CLI with initialized domains. Cannot be tested here.
 * See QUALITY_GAPS in report.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const SESSION_FILE = `${PROJECT_ROOT}/skills/learn/workflows/session.md`;

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// File existence + YAML front matter
// ---------------------------------------------------------------------------

describe("File existence and front matter — task 3.1", () => {
  it("session.md exists with valid YAML front matter (name, description, trigger)", () => {
    expect(existsSync(SESSION_FILE)).toBe(true);
    const content = readFile(SESSION_FILE);
    // Must open and close front matter block
    expect(content).toMatch(/^---\n/);
    const afterOpen = content.indexOf("---\n") + 4;
    expect(content.indexOf("---", afterOpen)).toBeGreaterThan(afterOpen);
    // Required fields
    expect(content).toMatch(/\nname:/);
    expect(content).toMatch(/\ndescription:/);
    expect(content).toMatch(/\ntrigger:/);
  });
});

// ---------------------------------------------------------------------------
// 5-phase coaching loop
// ---------------------------------------------------------------------------

describe("5-phase coaching loop — task 3.1", () => {
  it("all 5 phases are present as named headings (Present, Challenge, Evaluate, Adjust, Bridge)", () => {
    const content = readFile(SESSION_FILE);
    const missingPhases: string[] = [];
    for (const phase of [
      "Present",
      "Challenge",
      "Evaluate",
      "Adjust",
      "Bridge",
    ]) {
      if (!content.match(new RegExp(`#+\\s+Phase\\s+\\d+:\\s+${phase}`, "i"))) {
        missingPhases.push(phase);
      }
    }
    expect(missingPhases).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pre-session checklist (domain check, get-due, get-ready, queue, persona, lore)
// ---------------------------------------------------------------------------

describe("Pre-session checklist — task 3.1", () => {
  it("documents all 6 checklist steps including CLI commands and persona load", () => {
    const content = readFile(SESSION_FILE);
    // 6 numbered steps must be present under the checklist heading
    const missingSteps: string[] = [];
    for (let i = 1; i <= 6; i++) {
      if (!content.match(new RegExp(`###\\s+${i}\\.`, "i"))) {
        missingSteps.push(`Step ${i}`);
      }
    }
    expect(missingSteps).toEqual([]);
    // Required CLI commands must appear
    expect(content).toContain("dojo domain get");
    expect(content).toContain("dojo progress get-due");
    expect(content).toContain("dojo progress get-ready");
    // Queue building, persona loading, and lore enrichment must be referenced
    expect(content).toMatch(/session queue|Build Session Queue/i);
    expect(content).toMatch(/load persona|Load Persona/i);
    expect(content).toMatch(/lore|Lore/);
  });
});

// ---------------------------------------------------------------------------
// State boundary prohibition (HIGH RISK — session must never write state)
// ---------------------------------------------------------------------------

describe("State boundary prohibition — task 3.1", () => {
  it("explicitly and prominently prohibits dojo progress update and dojo session record during session", () => {
    const content = readFile(SESSION_FILE);
    // Prohibition must name both specific commands
    expect(content).toMatch(
      /do not call.*dojo progress update|NOT call.*dojo progress update/i,
    );
    expect(content).toMatch(
      /do not call.*dojo session record|NOT call.*dojo session record/i,
    );
    // Must appear in a callout or dedicated visible block — not buried in flowing prose
    expect(content).toMatch(
      />\s*\*\*State Boundary|##\s*State Boundary|---\s*\n\s*>\s*\*\*State Boundary/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Persona mandate (HIGH RISK — missing = voice drift mid-session)
// ---------------------------------------------------------------------------

describe("Persona mandate — task 3.1", () => {
  it("states persona governs character and workflow governs structure, and instructs never break character", () => {
    const content = readFile(SESSION_FILE);
    expect(content).toMatch(/persona.*governs|character.*persona/i);
    expect(content).toMatch(
      /workflow.*governs.*structure|structure.*workflow/i,
    );
    expect(content).toMatch(
      /maintain.*persona|never break character|Never break character/i,
    );
  });
});

// ---------------------------------------------------------------------------
// In-session state tracking (exit workflow depends on this data)
// ---------------------------------------------------------------------------

describe("In-session state tracking — task 3.1", () => {
  it("documents outcome values (nailed/struggled/partial) and new concept detection via state === 0", () => {
    const content = readFile(SESSION_FILE);
    // Outcome tracking must name all 3 values — exit workflow uses them for FSRS rating
    expect(content).toContain("nailed");
    expect(content).toContain("struggled");
    expect(content).toContain("partial");
    // New concept detection via the FSRS state field
    expect(content).toMatch(/state\s*===\s*0|state === 0/);
  });
});

// ---------------------------------------------------------------------------
// Context adaptation table
// ---------------------------------------------------------------------------

describe("Context adaptation table — task 3.1", () => {
  it("context adaptation table covers all 4 learning contexts as a markdown table", () => {
    const content = readFile(SESSION_FILE);
    const sectionMatch = content.match(
      /Context Adaptation[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Must be a markdown table
    expect(section).toContain("|");
    // All 4 contexts must appear
    const missingContexts: string[] = [];
    for (const ctx of [
      "Sprint",
      "Skill-Build",
      "Problem-Solve",
      "Deep Mastery",
    ]) {
      if (!section.includes(ctx)) {
        missingContexts.push(ctx);
      }
    }
    expect(missingContexts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Confusion pair handling
// ---------------------------------------------------------------------------

describe("Confusion pair handling — task 3.1", () => {
  it("confusion pair section is present and includes a comparison exercise instruction", () => {
    const content = readFile(SESSION_FILE);
    const sectionMatch = content.match(
      /## Confusion Pair[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    // Must instruct comparison exercise between paired concepts
    expect(sectionMatch![0]).toMatch(/compar|differ|distinction/i);
  });
});

// ---------------------------------------------------------------------------
// Empty queue handling
// ---------------------------------------------------------------------------

describe("Empty queue handling — task 3.1", () => {
  it("documents graceful handling when no concepts are due or ready", () => {
    const content = readFile(SESSION_FILE);
    expect(content).toMatch(
      /empty queue|Empty Queue|zero.*due|nothing due|ahead of schedule/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Session end + error handling
// ---------------------------------------------------------------------------

describe("Session end and error handling — task 3.1", () => {
  it("session end section references exit.md handoff and includes summary and preview steps", () => {
    const content = readFile(SESSION_FILE);
    // exit.md reference is the persistence trigger — if missing, state is never saved
    expect(content).toContain("exit.md");
    const sectionMatch = content.match(
      /## Session End[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    expect(section).toMatch(/summary|Summary/);
    expect(section).toMatch(/preview|Preview|next session/i);
  });

  it("error handling table is present and covers domain-not-found and get-due failure", () => {
    const content = readFile(SESSION_FILE);
    expect(content).toMatch(/## Error Handling/i);
    const sectionMatch = content.match(
      /## Error Handling[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    expect(section).toMatch(/domain not found|Domain not found/i);
    expect(section).toMatch(/get-due/i);
  });
});
