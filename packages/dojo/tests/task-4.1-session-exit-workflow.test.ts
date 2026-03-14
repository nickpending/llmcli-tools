/**
 * Task 4.1 — Session Exit Workflow: structural and content validation
 *
 * These are markdown model-instruction files, not executable code.
 * Tests verify file existence, structure, and critical constraint documentation.
 *
 * Invariants tested:
 * - exit.md exists at the correct project path
 * - YAML front matter has name, description, and trigger
 * - All 6 steps present as named headings
 * - FSRS rating decision table present with all 4 performance rows (easy, good, hard, again)
 * - CLI templates for all 3 dojo commands (progress update, add-confusion, session record)
 * - session record --data JSON template includes all 5 required fields
 * - session record --data JSON template does NOT include date or time_of_day
 * - Lore capture section includes `which lore` guard and explicit skip message
 * - Zero-concepts edge case is handled (skip Steps 2-3, record with empty array)
 * - Error handling table covers dojo not on PATH, session record failure, Lore failure
 *
 * INV-001 (state file schema integrity) and INV-002 (FSRS card validity) are runtime
 * invariants requiring a live dojo CLI with initialized domains. Cannot be tested here.
 * See QUALITY_GAPS in report.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const EXIT_FILE = `${PROJECT_ROOT}/skills/learn/workflows/exit.md`;

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// File existence + YAML front matter
// ---------------------------------------------------------------------------

describe("File existence and front matter — task 4.1", () => {
  it("exit.md exists with valid YAML front matter (name, description, trigger)", () => {
    expect(existsSync(EXIT_FILE)).toBe(true);
    const content = readFile(EXIT_FILE);
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
// 6-step workflow structure
// ---------------------------------------------------------------------------

describe("6-step workflow structure — task 4.1", () => {
  it("all 6 steps are present as named headings", () => {
    const content = readFile(EXIT_FILE);
    const missingSteps: string[] = [];
    for (let i = 1; i <= 6; i++) {
      if (!content.match(new RegExp(`##\\s+Step\\s+${i}:`, "i"))) {
        missingSteps.push(`Step ${i}`);
      }
    }
    expect(missingSteps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FSRS rating decision table (HIGH RISK — wrong ratings corrupt FSRS schedule)
// ---------------------------------------------------------------------------

describe("FSRS rating decision table — task 4.1", () => {
  it("rating decision table is present with all 4 performance rows (easy, good, hard, again)", () => {
    const content = readFile(EXIT_FILE);
    // Must be a markdown table within the rating section
    const sectionMatch = content.match(
      /Rating Decision Table[\s\S]*?(?=\n---\n|\n## |\n###\s+Mastery|$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    expect(section).toContain("|");
    // All 4 FSRS ratings must appear
    const missingRatings: string[] = [];
    for (const rating of ["`easy`", "`good`", "`hard`", "`again`"]) {
      if (!section.includes(rating)) {
        missingRatings.push(rating);
      }
    }
    expect(missingRatings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CLI templates for all 3 dojo commands
// ---------------------------------------------------------------------------

describe("CLI command templates — task 4.1", () => {
  it("documents CLI templates for progress update, add-confusion, and session record", () => {
    const content = readFile(EXIT_FILE);
    // All 3 required dojo commands must appear
    expect(content).toContain("dojo progress update");
    expect(content).toContain("dojo progress add-confusion");
    expect(content).toContain("dojo session record");
    // progress update must include --rating and --mastery flags
    expect(content).toMatch(/dojo progress update.*--rating/s);
    expect(content).toMatch(/dojo progress update.*--mastery/s);
    // session record must use --data flag
    expect(content).toMatch(/dojo session record.*--data/s);
  });
});

// ---------------------------------------------------------------------------
// session record JSON template — required fields (HIGH RISK — missing fields = CLI failure)
// ---------------------------------------------------------------------------

describe("session record JSON template fields — task 4.1", () => {
  it("JSON template includes all 5 required fields", () => {
    const content = readFile(EXIT_FILE);
    const sectionMatch = content.match(/## Step 4[\s\S]*?(?=\n---\n|\n## |$)/i);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    const missingFields: string[] = [];
    for (const field of [
      "concepts_covered",
      "calibration",
      "duration_minutes",
      "persona",
      "context",
    ]) {
      if (!section.includes(field)) {
        missingFields.push(field);
      }
    }
    expect(missingFields).toEqual([]);
  });

  it("JSON template does NOT include date or time_of_day (CLI derives these)", () => {
    const content = readFile(EXIT_FILE);
    const sectionMatch = content.match(/## Step 4[\s\S]*?(?=\n---\n|\n## |$)/i);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Extract only the JSON fenced block — avoid matching the prohibition text itself
    const jsonBlockMatch = section.match(/```[\s\S]*?```/);
    if (jsonBlockMatch) {
      const jsonBlock = jsonBlockMatch[0];
      expect(jsonBlock).not.toMatch(/"date"/);
      expect(jsonBlock).not.toMatch(/"time_of_day"/);
    } else {
      // No fenced JSON block found — fail with clear message
      expect(jsonBlockMatch).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Lore capture guard — which lore check + skip message
// ---------------------------------------------------------------------------

describe("Lore capture guard — task 4.1", () => {
  it("Lore section guards with `which lore` availability check and explicit skip message", () => {
    const content = readFile(EXIT_FILE);
    const sectionMatch = content.match(/## Step 5[\s\S]*?(?=\n---\n|\n## |$)/i);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Must check lore availability
    expect(section).toMatch(/which lore/);
    // Must provide explicit skip message when lore not on PATH
    expect(section).toMatch(/lore.*not on PATH|not on PATH.*lore/i);
    expect(section).toMatch(/skip|skipped/i);
    // Must NOT fail when lore is unavailable
    expect(section).toMatch(/do not fail|Do not fail|not.*block|never.*block/i);
  });
});

// ---------------------------------------------------------------------------
// Zero concepts edge case (important for empty sessions)
// ---------------------------------------------------------------------------

describe("Zero concepts edge case — task 4.1", () => {
  it("handles sessions with zero concepts covered (skip Steps 2-3, record with empty array)", () => {
    const content = readFile(EXIT_FILE);
    // Must mention zero concepts or empty session
    expect(content).toMatch(
      /zero concepts|Zero concepts|empty.*concepts|concepts.*empty|no concepts/i,
    );
    // Must instruct to skip Steps 2 and 3
    expect(content).toMatch(/skip Steps? 2 and 3|Skip Steps? 2.*3/i);
    // Must instruct to still record session with empty concepts_covered
    expect(content).toMatch(/concepts_covered.*\[\]|\[\].*concepts_covered/i);
  });
});

// ---------------------------------------------------------------------------
// Error handling table — HIGH RISK rows
// ---------------------------------------------------------------------------

describe("Error handling table — task 4.1", () => {
  it("error handling table is present and covers dojo not on PATH, session record failure, and Lore failure", () => {
    const content = readFile(EXIT_FILE);
    expect(content).toMatch(/## Error Handling/i);
    const sectionMatch = content.match(
      /## Error Handling[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Must cover dojo CLI not found
    expect(section).toMatch(/dojo.*not on PATH|`dojo` not on PATH/i);
    // Must cover session record failure — HIGH RISK (data loss)
    expect(section).toMatch(/dojo session record.*fails|session record.*fail/i);
    // Must cover lore not on PATH
    expect(section).toMatch(/lore.*not on PATH|`lore` not on PATH/i);
    // Must cover lore capture failure
    expect(section).toMatch(/lore.*capture.*fail|lore capture.*fail/i);
  });
});
