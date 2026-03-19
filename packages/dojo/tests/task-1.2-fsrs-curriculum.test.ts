/**
 * Task 1.2 — fsrs.ts and curriculum.ts invariant tests
 *
 * Invariants tested:
 * - INV-002: updateProgress produces a valid FSRS card state (state field changes, due date set)
 * - INV-003: validateCurriculum rejects cyclic concept graphs
 * - getDueConcepts includes new concepts (state:0, no progress entry)
 * - addConcept rejects unknown prerequisite IDs
 * - addConcept rejects duplicate concept IDs
 * - addConfusionPair is bidirectional and idempotent
 */

import { describe, it, expect, mock, afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Temp directory — isolated home for this test file
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync("/tmp/test-dojo-fsrs-");
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

// Write a minimal config.toml
const configDir = join(tempDir, ".config", "dojo");
mkdirSync(configDir, { recursive: true });
writeFileSync(
  join(configDir, "config.toml"),
  `[paths]
data = "${tempDir}/.local/share/dojo"
cache = "${tempDir}/.cache/dojo"

[fsrs]
request_retention = 0.9
maximum_interval = 36500
enable_fuzz = false
learning_steps = ["1m", "10m"]
relearning_steps = ["10m"]

[session]
target_duration_minutes = 15
concepts_per_session = 3
staleness_threshold_days = 7

[lore]
capture_on_exit = true
`,
);

// Mock os BEFORE dynamic imports — config.ts calls homedir() at runtime
mock.module("os", () => ({
  homedir: () => tempDir,
}));

// Dynamic imports AFTER mock — per quality.md isolation strategy
const { initDomain, readDomain, writeDomain } = await import("../lib/state.ts");
const { addConcept, validateCurriculum } = await import("../lib/curriculum.ts");
const { updateProgress, getDueConcepts, addConfusionPair } =
  await import("../lib/fsrs.ts");

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

let domainCounter = 0;

/** Create a fresh domain with a unique name for each test */
function freshDomain(): string {
  const name = `test-domain-${++domainCounter}`;
  initDomain(name, "test goal", "sprint", "mentor");
  return name;
}

/** Add a concept with no prerequisites to the given domain */
function addRoot(domain: string, id: string, title = id) {
  return addConcept(domain, {
    id,
    title,
    prereqs: [],
    difficulty: 1,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("curriculum.ts + fsrs.ts — task 1.2", () => {
  // -------------------------------------------------------------------------
  // Prereq validation: unknown prereq rejected
  // -------------------------------------------------------------------------

  it("addConcept rejects unknown prerequisite ID", () => {
    const domain = freshDomain();
    expect(() =>
      addConcept(domain, {
        id: "child",
        title: "Child Concept",
        prereqs: ["nonexistent-id"],
        difficulty: 2,
      }),
    ).toThrow(/Prerequisite 'nonexistent-id' not found/);
  });

  // -------------------------------------------------------------------------
  // Duplicate concept rejection
  // -------------------------------------------------------------------------

  it("addConcept rejects duplicate concept ID", () => {
    const domain = freshDomain();
    addRoot(domain, "alpha");
    expect(() => addRoot(domain, "alpha")).toThrow(/already exists/);
  });

  // -------------------------------------------------------------------------
  // INV-003: Cycle detection via validateCurriculum
  // -------------------------------------------------------------------------

  it("INV-003: validateCurriculum detects cycle and returns acyclic=false", () => {
    // Build a graph: A → B → C, then we manually inject C → A via writeDomain
    // Simpler: use the internal topologicalSort by building a state with a cycle
    // We can't force addConcept to create a cycle (prereq validation blocks it),
    // so we write a cyclic state directly and call validateCurriculum.
    const domain = freshDomain();
    // Add A and B normally
    addRoot(domain, "node-a");
    addConcept(domain, {
      id: "node-b",
      title: "B",
      prereqs: ["node-a"],
      difficulty: 1,
    });

    // Now inject a cycle by mutating the state directly: A depends on B
    const state = readDomain(domain);
    const nodeA = state.curriculum.concepts.find((c) => c.id === "node-a")!;
    nodeA.prerequisites = ["node-b"]; // creates A → B and B → A cycle
    writeDomain(state);

    const result = validateCurriculum(domain);
    expect(result.acyclic).toBe(false);
    expect(result.cycle).toBeDefined();
    expect(result.cycle!.length).toBeGreaterThan(0);
  });

  it("INV-003: validateCurriculum returns acyclic=true for valid DAG", () => {
    const domain = freshDomain();
    addRoot(domain, "root-concept");
    addConcept(domain, {
      id: "child-concept",
      title: "Child",
      prereqs: ["root-concept"],
      difficulty: 2,
    });

    const result = validateCurriculum(domain);
    expect(result.acyclic).toBe(true);
    expect(result.order).toBeDefined();
    // root must appear before child in topological order
    const order = result.order!;
    expect(order.indexOf("root-concept")).toBeLessThan(
      order.indexOf("child-concept"),
    );
  });

  // -------------------------------------------------------------------------
  // getDueConcepts: new concepts (no progress entry) are included
  // -------------------------------------------------------------------------

  it("getDueConcepts includes new concepts with state=0 (never reviewed)", () => {
    const domain = freshDomain();
    addRoot(domain, "new-concept-1", "New Concept 1");
    addRoot(domain, "new-concept-2", "New Concept 2");

    const due = getDueConcepts(domain);
    const ids = due.map((d) => d.concept_id);

    expect(ids).toContain("new-concept-1");
    expect(ids).toContain("new-concept-2");

    const entry = due.find((d) => d.concept_id === "new-concept-1")!;
    expect(entry.state).toBe(0);
    expect(entry.mastery).toBe("none");
  });

  // -------------------------------------------------------------------------
  // INV-002: updateProgress produces valid FSRS card state
  // -------------------------------------------------------------------------

  it("INV-002: updateProgress returns a card with state > 0 after rating 'good'", () => {
    const domain = freshDomain();
    addRoot(domain, "fsrs-concept");

    const result = updateProgress(domain, "fsrs-concept", "good");

    // Card state must have advanced from 0 (New) to 1 (Learning)
    expect(result.domain.progress["fsrs-concept"]).toBeDefined();
    const card = result.domain.progress["fsrs-concept"].fsrs_card;
    expect(typeof card.state).toBe("number");
    expect(card.state).toBeGreaterThan(0);

    // next_due is a valid ISO date string
    expect(typeof result.next_due).toBe("string");
    expect(() => new Date(result.next_due)).not.toThrow();
    expect(new Date(result.next_due).getTime()).toBeGreaterThan(0);
  });

  it("INV-002: repeated 'again' ratings keep card reviewable (stability degrades, not corrupts)", () => {
    const domain = freshDomain();
    addRoot(domain, "hard-concept");

    updateProgress(domain, "hard-concept", "again");
    const result = updateProgress(domain, "hard-concept", "again");

    // Card must still be a valid object with required fields
    const card = result.domain.progress["hard-concept"].fsrs_card;
    expect(card).not.toBeNull();
    expect(typeof card.state).toBe("number");
    expect(typeof result.next_due).toBe("string");
  });

  // -------------------------------------------------------------------------
  // addConfusionPair: bidirectional and idempotent
  // -------------------------------------------------------------------------

  it("addConfusionPair creates bidirectional link between concepts", () => {
    const domain = freshDomain();
    addRoot(domain, "pair-a");
    addRoot(domain, "pair-b");

    addConfusionPair(domain, "pair-a", "pair-b");

    const state = readDomain(domain);

    expect(state.progress["pair-a"].confusion_pairs).toContain("pair-b");
    expect(state.progress["pair-b"].confusion_pairs).toContain("pair-a");
  });

  it("addConfusionPair is idempotent — calling twice does not duplicate entries", () => {
    const domain = freshDomain();
    addRoot(domain, "idem-a");
    addRoot(domain, "idem-b");

    addConfusionPair(domain, "idem-a", "idem-b");
    addConfusionPair(domain, "idem-a", "idem-b");

    const state = readDomain(domain);

    const pairsA = state.progress["idem-a"].confusion_pairs.filter(
      (p) => p === "idem-b",
    );
    const pairsB = state.progress["idem-b"].confusion_pairs.filter(
      (p) => p === "idem-a",
    );
    expect(pairsA.length).toBe(1);
    expect(pairsB.length).toBe(1);
  });
});
