/**
 * Task 9.1 — Session spawn: pure logic tests for domain resolution,
 * concept queue formatting, persona extraction, and prompt assembly.
 *
 * Invariants tested:
 * - resolveDomain: exact match returns domain; substring match resolves; multiple matches throws; no match throws with domain list
 * - buildConceptQueue: empty array produces fallback string; non-empty produces formatted list
 * - extractPersonaIdentity: extracts System Prompt section up to next ## heading
 * - extractPersonaDisplayName: extracts name before em-dash from H1 line
 * - assemblePrompt: all 5 variable slots substituted; 2 embedded markers replaced; HTML comment stripped; no {{ remains
 */

import { describe, it, expect, mock, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// Temp directory for mocked filesystem (domain resolution tests)
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync("/tmp/test-dojo-spawn-");
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

// Create fake domains directory with test domain files
const domainsDir = `${tempDir}/.local/share/dojo/domains`;
mkdirSync(domainsDir, { recursive: true });

// Create fake config with all required fields
const configDir = `${tempDir}/.config/dojo`;
mkdirSync(configDir, { recursive: true });
writeFileSync(
  `${configDir}/config.toml`,
  `[paths]
data = "${tempDir}/.local/share/dojo"
cache = "${tempDir}/.cache/dojo"

[fsrs]
request_retention = 0.9
maximum_interval = 365
enable_fuzz = true
learning_steps = ["1m", "10m"]
relearning_steps = ["10m"]

[session]
target_duration_minutes = 15
concepts_per_session = 3
staleness_threshold_days = 7

[lore]
capture_on_exit = true
`,
  "utf-8",
);

// Create test domain files
const testDomain = {
  domain: "neural-nets-to-gpt2",
  goal: "test",
  context: "skill-build",
  persona: "miriam-khoury",
  sources: [],
  curriculum: {
    concepts: [],
    generated_from: "model-knowledge",
    generated_at: "2026-01-01T00:00:00Z",
  },
  progress: {},
  session_history: [],
  session_count: 0,
  last_session: null,
};
writeFileSync(
  `${domainsDir}/neural-nets-to-gpt2.json`,
  JSON.stringify(testDomain),
  "utf-8",
);
writeFileSync(
  `${domainsDir}/go-concurrency.json`,
  JSON.stringify({ ...testDomain, domain: "go-concurrency" }),
  "utf-8",
);
writeFileSync(
  `${domainsDir}/go-basics.json`,
  JSON.stringify({ ...testDomain, domain: "go-basics" }),
  "utf-8",
);

// ---------------------------------------------------------------------------
// Mock os and config so listDomains/readDomain use temp dir
// ---------------------------------------------------------------------------

mock.module("os", () => ({
  homedir: () => tempDir,
}));

mock.module("../lib/config", () => ({
  getConfig: () => ({
    paths: {
      data: `${tempDir}/.local/share/dojo`,
      cache: `${tempDir}/.cache/dojo`,
    },
    fsrs: {
      request_retention: 0.9,
      maximum_interval: 365,
      enable_fuzz: true,
      learning_steps: ["1m", "10m"],
      relearning_steps: ["10m"],
    },
    session: {
      target_duration_minutes: 15,
      concepts_per_session: 3,
      staleness_threshold_days: 7,
    },
    lore: {
      capture_on_exit: true,
    },
  }),
}));

// Dynamic imports AFTER mocks — per quality.md isolation strategy
const {
  resolveDomain,
  buildConceptQueue,
  extractPersonaIdentity,
  extractPersonaDisplayName,
  assemblePrompt,
} = await import("../lib/spawn");

// ---------------------------------------------------------------------------
// Domain resolution
// ---------------------------------------------------------------------------

describe("resolveDomain — task 9.1 session spawn", () => {
  it("exact match returns the domain", () => {
    expect(resolveDomain("neural-nets-to-gpt2")).toBe("neural-nets-to-gpt2");
  });

  it("substring match resolves to the single matching domain", () => {
    expect(resolveDomain("neural-nets")).toBe("neural-nets-to-gpt2");
  });

  it("multiple substring matches throws with disambiguation list", () => {
    expect(() => resolveDomain("go")).toThrow(
      /Ambiguous.*go-basics.*go-concurrency|Ambiguous.*go-concurrency.*go-basics/,
    );
  });

  it("no match throws with available domain list", () => {
    expect(() => resolveDomain("nonexistent")).toThrow(/No domain matching/);
    expect(() => resolveDomain("nonexistent")).toThrow(/neural-nets-to-gpt2/);
  });
});

// ---------------------------------------------------------------------------
// Concept queue formatting
// ---------------------------------------------------------------------------

describe("buildConceptQueue — task 9.1 session spawn", () => {
  // Minimal mock DomainState for existing tests (no resources, no progress)
  const emptyDomainState = {
    domain: "test",
    goal: "test",
    context: "skill-build" as const,
    persona: "test",
    sources: [],
    curriculum: {
      concepts: [],
      generated_from: "model-knowledge" as const,
      generated_at: "2026-01-01T00:00:00Z",
    },
    progress: {},
    session_history: [],
    session_count: 0,
    last_session: null,
  };

  it("empty array produces fallback string", () => {
    const result = buildConceptQueue([], emptyDomainState);
    expect(result).toContain("No concepts due");
  });

  it("non-empty array produces formatted list with state mapping", () => {
    const concepts = [
      {
        concept_id: "c1",
        title: "Backprop",
        due: "2026-01-01",
        state: 0,
        mastery: "none" as const,
        confusion_pair: false,
      },
      {
        concept_id: "c2",
        title: "Attention",
        due: "2026-01-01",
        state: 2,
        mastery: "introduced" as const,
        confusion_pair: false,
      },
    ];
    const result = buildConceptQueue(concepts, emptyDomainState);
    expect(result).toContain(
      "- [Backprop] (state: new, mastery: none, plan: none)",
    );
    expect(result).toContain(
      "- [Attention] (state: review, mastery: introduced, plan: none)",
    );
  });
});

// ---------------------------------------------------------------------------
// Persona extraction
// ---------------------------------------------------------------------------

const SAMPLE_PERSONA = `# Miriam Khoury — "The Architect"

**Archetype:** Architect / Socratic

## Backstory

Some backstory text.

## System Prompt

You are Miriam Khoury, an architect and Socratic teacher.

Always establish what the learner already understands.

## Learning Context Adaptation

| Context | Behavior |
|---------|----------|
| Sprint | Trace only the critical path. |
`;

describe("extractPersonaIdentity — task 9.1 session spawn", () => {
  it("extracts text between System Prompt and next ## heading", () => {
    const result = extractPersonaIdentity(SAMPLE_PERSONA);
    expect(result).toContain("You are Miriam Khoury");
    expect(result).toContain(
      "Always establish what the learner already understands.",
    );
    expect(result).not.toContain("Learning Context Adaptation");
    expect(result).not.toContain("Backstory");
  });
});

describe("extractPersonaDisplayName — task 9.1 session spawn", () => {
  it("extracts name before em-dash from H1", () => {
    const result = extractPersonaDisplayName(SAMPLE_PERSONA);
    expect(result).toBe("Miriam Khoury");
  });

  it("handles H1 without em-dash", () => {
    const result = extractPersonaDisplayName("# Simple Name\n\nContent");
    expect(result).toBe("Simple Name");
  });
});

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

const SAMPLE_TEMPLATE = `# Coaching Session

<!--
Variable Slots — Canonical Reference for Assembly (Task 4.1)

| Slot | Content |
|------|---------|
| {{PERSONA_IDENTITY}} | Full System Prompt section |
-->

{{PERSONA_IDENTITY}}

---

## Instructional Framework

<!-- FRAMEWORK_CONTENT_EMBEDDED_HERE: read coaching/framework.md and inline all content at this position -->

---

## Session Context

**Domain:** {{DOMAIN_NAME}}
**Learning Context:** {{LEARNING_CONTEXT}}

**Concepts for this session:**
{{CONCEPT_QUEUE}}

**Prior session context (Lore):**
{{LORE_CONTEXT}}

---

## Behavioral Guards

<!-- GUARDS_CONTENT_EMBEDDED_HERE: read coaching/guards.md and inline all content at this position -->
`;

describe("assemblePrompt — task 9.1 session spawn", () => {
  it("all substitutions applied and no unresolved tokens remain", () => {
    const result = assemblePrompt(
      SAMPLE_TEMPLATE,
      "You are Test Persona.",
      "Framework content here.",
      "Guards content here.",
      "test-domain",
      "skill-build",
      "- [Concept A] (state: new, mastery: none)",
      "none",
    );

    // Variable slots replaced
    expect(result).toContain("You are Test Persona.");
    expect(result).toContain("test-domain");
    expect(result).toContain("skill-build");
    expect(result).toContain("- [Concept A] (state: new, mastery: none)");
    expect(result).toContain("none");

    // Embedded content markers replaced
    expect(result).toContain("Framework content here.");
    expect(result).toContain("Guards content here.");

    // No unresolved tokens
    expect(result).not.toContain("{{");
    expect(result).not.toContain("FRAMEWORK_CONTENT_EMBEDDED_HERE");
    expect(result).not.toContain("GUARDS_CONTENT_EMBEDDED_HERE");
  });

  it("HTML comment block stripped from top", () => {
    const result = assemblePrompt(
      SAMPLE_TEMPLATE,
      "identity",
      "fw",
      "guards",
      "d",
      "c",
      "q",
      "l",
    );
    expect(result).not.toContain("Canonical Reference for Assembly");
    expect(result).not.toContain("Variable Slots");
  });
});
