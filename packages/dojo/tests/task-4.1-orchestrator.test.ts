/**
 * Task 4.1 — Learn Skill Orchestrator: structural and content validation
 *
 * These are markdown model-instruction files, not executable code.
 * Tests verify SKILL.md routing completeness, session spawn procedure structure,
 * and exit.md frontmatter correctness.
 *
 * Updated for task 9.1: SKILL.md session spawn procedure simplified from 12 steps
 * to 3 steps. Steps 3-12 (persona reading, file assembly, slot substitution,
 * script writing, terminal spawning) moved into lib/spawn.ts TypeScript subcommand.
 * SKILL.md now delegates to `dojo session spawn <domain>`.
 *
 * Invariants tested:
 * - SKILL.md routing table has exactly 3 entries (setup, status, session-spawn — exit removed)
 * - SKILL.md does NOT route to workflows/session.md (session is now inline spawn procedure)
 * - SKILL.md does NOT have exit routing (exit is handled inside coaching session)
 * - Session spawn procedure has exactly 3 steps (not 12)
 * - SKILL.md references `dojo session spawn` CLI command in the session procedure
 * - exit.md frontmatter trigger updated to coaching session context (not Sable context)
 *
 * INV-001 through INV-007 runtime invariants require live dojo CLI — cannot be tested here.
 * See QUALITY_GAPS in report.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const SKILL_FILE = `${PROJECT_ROOT}/skills/learn/SKILL.md`;
const EXIT_FILE = `${PROJECT_ROOT}/skills/learn/workflows/exit.md`;

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// SKILL.md routing table — new 3-row structure (HIGH RISK: wrong routing = broken UX)
// ---------------------------------------------------------------------------

describe("SKILL.md routing table — task 4.1 orchestrator", () => {
  it("routing table routes setup and status to workflow files", () => {
    const content = readFile(SKILL_FILE);
    // These two rows must still be present
    expect(content).toContain("workflows/setup.md");
    expect(content).toContain("workflows/status.md");
  });

  it("routing table does NOT route session to workflows/session.md (session is now inline spawn procedure)", () => {
    const content = readFile(SKILL_FILE);
    // session.md routing was intentionally removed — session is now an inline spawn procedure
    expect(content).not.toContain("workflows/session.md");
  });

  it("exit routing removed from SKILL.md (exit now handled inside coaching session)", () => {
    const content = readFile(SKILL_FILE);
    // exit routing row was intentionally removed — exit.md is loaded from within the coaching session
    // Check that the routing table doesn't route to workflows/exit.md
    // Look only at the routing table section (before the spawn procedure)
    const routingTableMatch = content.match(
      /## Determine Action[\s\S]*?(?=\n---\n|\n## Session)/i,
    );
    expect(routingTableMatch).not.toBeNull();
    const routingTable = routingTableMatch![0];
    expect(routingTable).not.toContain("workflows/exit.md");
    // Also verify done/exit/finished/quit are not in the routing table as actions
    // (they may appear in a comment-like form but not as a routed action)
    expect(routingTable).not.toMatch(
      /done.*exit.*finished.*quit.*Read and follow/i,
    );
  });

  it("session intent row references the spawn procedure (not a workflow file)", () => {
    const content = readFile(SKILL_FILE);
    const routingTableMatch = content.match(
      /## Determine Action[\s\S]*?(?=\n---\n|\n## Session)/i,
    );
    expect(routingTableMatch).not.toBeNull();
    const routingTable = routingTableMatch![0];
    // Session row must route to the inline spawn procedure
    expect(routingTable).toMatch(
      /session.*Spawn|spawn.*coaching|Follow.*Session|Spawn Coaching/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 3-step session spawn procedure (simplified from 12 steps — task 9.1)
// ---------------------------------------------------------------------------

describe("Session spawn procedure — task 4.1/9.1 orchestrator", () => {
  it("spawn procedure section header is present", () => {
    const content = readFile(SKILL_FILE);
    expect(content).toMatch(/## Session.*Spawn Coaching Instance/i);
  });

  it("spawn procedure has exactly 3 steps", () => {
    const content = readFile(SKILL_FILE);
    // Extract the spawn procedure section
    const sectionMatch = content.match(
      /## Session.*Spawn Coaching Instance[\s\S]*?(?=\n---\n## Personas|\n---\n$|$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];

    // Count ### Step N headings
    const stepMatches = section.match(/### Step \d+/g);
    expect(stepMatches).not.toBeNull();
    expect(stepMatches!.length).toBe(3);
  });

  it("spawn procedure references dojo session spawn CLI command", () => {
    const content = readFile(SKILL_FILE);
    const sectionMatch = content.match(
      /## Session.*Spawn Coaching Instance[\s\S]*?(?=\n---\n## Personas|\n---\n$|$)/i,
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];
    expect(section).toContain("dojo session spawn");
  });
});

// ---------------------------------------------------------------------------
// exit.md frontmatter — coaching session context (not Sable context)
// ---------------------------------------------------------------------------

describe("exit.md frontmatter context — task 4.1 orchestrator", () => {
  it("exit.md trigger field references coaching session context (not Sable or session.md)", () => {
    expect(existsSync(EXIT_FILE)).toBe(true);
    const content = readFile(EXIT_FILE);
    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();
    const frontmatter = fmMatch![1];
    // Trigger must reference coaching session
    expect(frontmatter).toMatch(/coaching session/i);
    // Must NOT reference session.md (that's the old context)
    expect(frontmatter).not.toContain("session.md");
    // Must reference the coaching system prompt as the trigger mechanism
    expect(frontmatter).toMatch(/system prompt|coaching system prompt/i);
  });
});
