/**
 * Task 7.1 — Status Display Workflow: structural and content validation
 *
 * These are markdown model-instruction files, not executable code.
 * Tests verify file existence, structure, and critical constraint documentation.
 *
 * Invariants tested:
 * - status.md exists at the correct project path
 * - YAML front matter has name, description, and trigger
 * - All 4 steps present as named headings (Steps 1–4)
 * - Pre-flight check documents `dojo session status` CLI command
 * - `dojo session status` CLI command present for both all-domains and single-domain paths
 * - Empty state guard in Step 2 stops workflow (does not proceed to Step 3)
 * - Error handling table is present and covers CLI not found, command failure, and named-domain-not-found
 * - Named-domain-not-found response includes fallback to all-domains call
 *
 * Runtime invariants (cannot be tested without live dojo CLI):
 * - `dojo session status` returns valid JSON with data.domains array
 * - Multi-domain and single-domain outputs produce readable display
 * These are in QUALITY_GAPS.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const STATUS_FILE = `${PROJECT_ROOT}/skills/learn/workflows/status.md`;

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// File existence + YAML front matter
// ---------------------------------------------------------------------------

describe("File existence and front matter — task 7.1", () => {
  it("status.md exists with valid YAML front matter (name, description, trigger)", () => {
    expect(existsSync(STATUS_FILE)).toBe(true);
    const content = readFile(STATUS_FILE);
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
// 4-step workflow structure
// ---------------------------------------------------------------------------

describe("4-step workflow structure — task 7.1", () => {
  it("all 4 steps are present as named headings", () => {
    const content = readFile(STATUS_FILE);
    const missingSteps: string[] = [];
    for (let i = 1; i <= 4; i++) {
      if (!content.match(new RegExp(`##\\s+Step\\s+${i}:`, "i"))) {
        missingSteps.push(`Step ${i}`);
      }
    }
    expect(missingSteps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CLI command presence (HIGH RISK — without this, model has no way to fetch data)
// ---------------------------------------------------------------------------

describe("CLI command presence — task 7.1", () => {
  it("documents dojo session status command for both all-domains and single-domain paths", () => {
    const content = readFile(STATUS_FILE);
    // Must reference the CLI command at least twice (all-domains + single-domain)
    const matches = content.match(/dojo session status/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
    // Single-domain variant must include a domain argument placeholder
    expect(content).toMatch(/dojo session status\s+<domain>/);
  });
});

// ---------------------------------------------------------------------------
// Empty state guard (MEDIUM RISK — missing = model formats empty array, produces garbage)
// ---------------------------------------------------------------------------

describe("Empty state guard — task 7.1", () => {
  it("Step 2 checks for empty domains array and stops workflow before Step 3", () => {
    const content = readFile(STATUS_FILE);
    const sectionMatch = content.match(
      /## Step 2:[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Must check for empty domains
    expect(section).toMatch(/empty array|domains.*empty|\[\]|empty.*domains/i);
    // Must instruct the model to stop (not proceed to Step 3)
    expect(section).toMatch(
      /do not proceed|Do not proceed|stop\.|Stop\.|not proceed to Step 3/i,
    );
    // Must suggest setup action
    expect(section).toMatch(/set up|start learning|setup\.md|\/learn/i);
  });
});

// ---------------------------------------------------------------------------
// Named domain not found (MEDIUM RISK — common user error, must have explicit handling)
// ---------------------------------------------------------------------------

describe("Named domain not found handling — task 7.1", () => {
  it("documents fallback to all-domains call when named domain is not found", () => {
    const content = readFile(STATUS_FILE);
    const sectionMatch = content.match(
      /## Step 1:[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Must handle named-domain-not-found case
    expect(section).toMatch(/not found|domain.*not found/i);
    // Must fall back to all-domains call to list available options
    expect(section).toMatch(/dojo session status/);
    // Must tell user what domains are available
    expect(section).toMatch(
      /available domains|Available domains|list.*domains/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling table (MEDIUM RISK — model needs explicit error instructions)
// ---------------------------------------------------------------------------

describe("Error handling table — task 7.1", () => {
  it("error handling table is present and covers CLI not found, command failure, and named-domain-not-found", () => {
    const content = readFile(STATUS_FILE);
    expect(content).toMatch(/## Error Handling/i);
    const sectionMatch = content.match(
      /## Error Handling[\s\S]*?(?=\n---\n|\n## |$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    // Must be a markdown table
    expect(section).toContain("|");
    // Must cover dojo CLI not found
    expect(section).toMatch(/dojo.*not on PATH|`dojo` not on PATH/i);
    // Must cover dojo session status command failure
    expect(section).toMatch(/dojo session status.*fail|session status.*fail/i);
    // Must cover named domain not found
    expect(section).toMatch(/domain.*not found|Named domain not found/i);
  });
});

// ---------------------------------------------------------------------------
// Read-only confirmation (LOW RISK to test, but verifies a key design property)
// ---------------------------------------------------------------------------

describe("Read-only workflow — task 7.1", () => {
  it("workflow is read-only: does not reference dojo progress update or dojo session record", () => {
    const content = readFile(STATUS_FILE);
    // These write commands must not appear in a read-only status workflow
    expect(content).not.toContain("dojo progress update");
    expect(content).not.toContain("dojo session record");
  });
});
