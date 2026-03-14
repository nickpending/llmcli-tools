/**
 * Task 2.1 — Domain Setup Workflow: structural and content validation
 *
 * These are markdown model-instruction files, not executable code.
 * Tests verify file existence, structure, and critical constraint documentation.
 *
 * Invariants tested:
 * - Both workflow files exist at correct paths
 * - Both files have valid YAML front matter
 * - SKILL.md routing table has all 4 required entries (setup, session, exit, status)
 * - setup.md has all 10 steps
 * - All 11 persona slugs are listed in setup.md Step 5
 * - All 4 valid learning contexts are documented in setup.md Step 3
 * - Resource JSON schema has all 6 required fields documented in setup.md Step 9
 * - Topological ordering constraint is explicitly documented (Steps 7-8)
 * - Domain existence check is documented in Step 1
 * - Sources-not-persisted constraint is documented in Step 4a
 *
 * INV-001 (state file schema) and INV-003 (concept graph acyclicity) require
 * live CLI execution and cannot be tested here. See QUALITY_GAPS in report.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const SKILL_FILE = `${PROJECT_ROOT}/skills/learn/SKILL.md`;
const SETUP_FILE = `${PROJECT_ROOT}/skills/learn/workflows/setup.md`;

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// File existence
// ---------------------------------------------------------------------------

describe("File existence — task 2.1", () => {
  it("SKILL.md exists at the correct path", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
  });

  it("workflows/setup.md exists at the correct path", () => {
    expect(existsSync(SETUP_FILE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// YAML front matter
// ---------------------------------------------------------------------------

describe("YAML front matter — task 2.1", () => {
  it("SKILL.md has YAML front matter with name and description", () => {
    const content = readFile(SKILL_FILE);
    // Front matter must be bounded by --- delimiters
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/\nname:/);
    expect(content).toMatch(/\ndescription:/);
    // Must close the front matter block
    const afterOpen = content.indexOf("---\n") + 4;
    expect(content.indexOf("---", afterOpen)).toBeGreaterThan(afterOpen);
  });

  it("setup.md has YAML front matter with name, description, and trigger", () => {
    const content = readFile(SETUP_FILE);
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/\nname:/);
    expect(content).toMatch(/\ndescription:/);
    expect(content).toMatch(/\ntrigger:/);
    const afterOpen = content.indexOf("---\n") + 4;
    expect(content.indexOf("---", afterOpen)).toBeGreaterThan(afterOpen);
  });
});

// ---------------------------------------------------------------------------
// SKILL.md routing table completeness
// ---------------------------------------------------------------------------

describe("SKILL.md routing table — task 2.1", () => {
  it("routing table includes all 4 required workflow entries", () => {
    const content = readFile(SKILL_FILE);
    // Each of the four intents must route to the corresponding workflow
    expect(content).toContain("workflows/setup.md");
    expect(content).toContain("workflows/session.md");
    expect(content).toContain("workflows/exit.md");
    expect(content).toContain("workflows/status.md");
  });

  it("routing table covers all 4 intent categories (setup, session, exit, status)", () => {
    const content = readFile(SKILL_FILE);
    // Intent keywords for each workflow must be present
    expect(content).toMatch(/setup|new domain|teach me|I want to learn/i);
    expect(content).toMatch(/session|practice|review|continue/i);
    expect(content).toMatch(/done|exit|finished|quit/i);
    expect(content).toMatch(/status|progress|overview/i);
  });
});

// ---------------------------------------------------------------------------
// setup.md: all 10 steps present
// ---------------------------------------------------------------------------

describe("setup.md steps — task 2.1", () => {
  it("all 10 numbered steps are present", () => {
    const content = readFile(SETUP_FILE);
    const missingSteps: string[] = [];
    for (let i = 1; i <= 10; i++) {
      // Accept "## Step N:" or "## Step N " or "Step N:" patterns
      if (!content.match(new RegExp(`## Step ${i}[:\\s]`, "i"))) {
        missingSteps.push(`Step ${i}`);
      }
    }
    expect(missingSteps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setup.md: persona slugs
// ---------------------------------------------------------------------------

const REQUIRED_PERSONA_SLUGS = [
  "marcus",
  "elena-analyst",
  "elena-scientist",
  "kaz",
  "mariana",
  "mira",
  "miriam-katz",
  "miriam-khoury",
  "quinn",
  "thales",
  "vera",
];

describe("setup.md persona slugs — task 2.1", () => {
  it("all 11 persona slugs are listed", () => {
    const content = readFile(SETUP_FILE);
    const missingSlugs: string[] = [];
    for (const slug of REQUIRED_PERSONA_SLUGS) {
      // Slug must appear as a backtick-quoted value in the routing table
      if (!content.includes(`\`${slug}\``)) {
        missingSlugs.push(slug);
      }
    }
    expect(missingSlugs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setup.md: learning contexts
// ---------------------------------------------------------------------------

const REQUIRED_CONTEXTS = [
  "sprint",
  "skill-build",
  "problem-solve",
  "deep-mastery",
];

describe("setup.md learning contexts — task 2.1", () => {
  it("all 4 valid learning contexts are documented", () => {
    const content = readFile(SETUP_FILE);
    const missingContexts: string[] = [];
    for (const ctx of REQUIRED_CONTEXTS) {
      if (!content.includes(`\`${ctx}\``)) {
        missingContexts.push(ctx);
      }
    }
    expect(missingContexts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setup.md: resource JSON schema
// ---------------------------------------------------------------------------

const REQUIRED_RESOURCE_FIELDS = [
  "title",
  "url",
  "type",
  "quality",
  "free",
  "note",
];

describe("setup.md resource schema — task 2.1", () => {
  it("all 6 required resource fields are documented in Step 9", () => {
    const content = readFile(SETUP_FILE);
    // Extract Step 9 section content
    const step9Match = content.match(
      /## Step 9[:\s][\s\S]*?(?=## Step 10|## Error Handling|$)/i,
    );
    expect(step9Match).not.toBeNull();
    const step9 = step9Match![0];

    const missingFields: string[] = [];
    for (const field of REQUIRED_RESOURCE_FIELDS) {
      if (!step9.includes(`\`${field}\``)) {
        missingFields.push(field);
      }
    }
    expect(missingFields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setup.md: critical constraint documentation
// ---------------------------------------------------------------------------

describe("setup.md critical constraints — task 2.1", () => {
  it("topological ordering is explicitly documented before Step 8 insertion", () => {
    const content = readFile(SETUP_FILE);
    // The word "topological" must appear — it's the key term for this constraint
    expect(content).toMatch(/topological/i);
    // Step 7 or 8 must mention ordering (prereqs must be inserted first)
    const step7Match = content.match(/## Step 7[:\s][\s\S]*?(?=## Step 8|$)/i);
    expect(step7Match).not.toBeNull();
    const step7 = step7Match![0];
    expect(step7).toMatch(/topological|ordering|order/i);
  });

  it("domain existence check is documented in Step 1", () => {
    const content = readFile(SETUP_FILE);
    const step1Match = content.match(/## Step 1[:\s][\s\S]*?(?=## Step 2|$)/i);
    expect(step1Match).not.toBeNull();
    const step1 = step1Match![0];
    // Must show the CLI command for existence check
    expect(step1).toContain("dojo domain get");
    // Must handle the case where domain already exists
    expect(step1).toMatch(/already exists|domain exists/i);
  });

  it("sources-not-persisted constraint is documented in Step 4a", () => {
    const content = readFile(SETUP_FILE);
    const step4aMatch = content.match(
      /### Step 4a[:\s][\s\S]*?(?=## Step 5|---\n## Step 5|$)/i,
    );
    expect(step4aMatch).not.toBeNull();
    const step4a = step4aMatch![0];
    // Must explicitly state sources are not persisted via CLI
    expect(step4a).toMatch(/not persisted|no CLI command to store/i);
  });
});
