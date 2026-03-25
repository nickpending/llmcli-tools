/**
 * Task 3.1 — Enriched concept queue: resource titles + lesson plan status
 *
 * Tests the extended buildConceptQueue(concepts, domainState) function.
 * These tests protect the invariants that matter for coaching quality:
 *
 * INV-010: Concept queue output includes resource titles when resources exist.
 *          A coaching model without resource names speaks generically instead of
 *          directing the learner to specific materials.
 *
 * Plan status: Stale lesson_plan_path (file deleted) must show "plan: none" —
 *              if the stale path were shown, the coaching model would believe a
 *              plan exists and fail to guide plan creation.
 *
 * Invariants tested:
 * - Concept with resources → output contains resource title and URL
 * - Concept with multiple resources → all resources present
 * - Concept with no resources → output shows "Resources: none"
 * - Concept with lesson_plan_path set and file exists → "plan: exists at <path>"
 * - Concept with lesson_plan_path set but file deleted → "plan: none" (existsSync guard)
 * - Concept with no progress entry → "plan: none"
 * - Empty concept list → "all caught up" fallback string
 */

import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Temp directory for lesson plan path tests (cleaned up after all tests)
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync("/tmp/test-dojo-queue-");
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Import buildConceptQueue directly — no mocking needed.
// buildConceptQueue is pure logic: it takes (concepts, domainState) and
// calls existsSync from node:fs. No config reads, no os.homedir calls.
// ---------------------------------------------------------------------------

import { buildConceptQueue } from "../lib/spawn";
import type { DomainState, DueConcept } from "../lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDomainState(partial: Partial<DomainState>): DomainState {
  return {
    domain: "test",
    goal: "test",
    context: "skill-build",
    persona: "test",
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
    ...partial,
  };
}

function makeConcept(
  id: string,
  title: string,
  state = 0,
  mastery: DueConcept["mastery"] = "none",
): DueConcept {
  return {
    concept_id: id,
    title,
    due: "2026-01-01",
    state,
    mastery,
    confusion_pair: false,
  };
}

// ---------------------------------------------------------------------------
// Empty queue
// ---------------------------------------------------------------------------

describe("buildConceptQueue — empty list (task 3.1)", () => {
  it("returns fallback string when concept list is empty", () => {
    const result = buildConceptQueue([], makeDomainState({}));
    expect(result).toContain("No concepts due");
    expect(result).toContain("all caught up");
  });
});

// ---------------------------------------------------------------------------
// INV-010: Resource titles present in output
// ---------------------------------------------------------------------------

describe("buildConceptQueue — resource rendering (INV-010)", () => {
  it("concept with resources includes resource title and URL in output", () => {
    const state = makeDomainState({
      curriculum: {
        concepts: [
          {
            id: "c1",
            title: "Neurons",
            description: "",
            prerequisites: [],
            difficulty_estimate: 1,
            source_refs: [],
            resources: [
              {
                title: "3Blue1Brown: Neural Networks",
                url: "https://youtu.be/aircAruvnKk",
                type: "video",
                quality: "essential",
                free: true,
                note: "",
              },
            ],
          },
        ],
        generated_from: "model-knowledge",
        generated_at: "2026-01-01T00:00:00Z",
      },
    });

    const result = buildConceptQueue([makeConcept("c1", "Neurons")], state);
    // INV-010: resource title must be present — coaching model uses this to name specific materials
    expect(result).toContain("3Blue1Brown: Neural Networks");
    expect(result).toContain("https://youtu.be/aircAruvnKk");
  });

  it("concept with multiple resources includes all of them", () => {
    const state = makeDomainState({
      curriculum: {
        concepts: [
          {
            id: "c1",
            title: "Backprop",
            description: "",
            prerequisites: [],
            difficulty_estimate: 2,
            source_refs: [],
            resources: [
              {
                title: "3Blue1Brown: Backpropagation",
                url: "https://youtu.be/Ilg3gGewQ5U",
                type: "video",
                quality: "essential",
                free: true,
                note: "",
              },
              {
                title: "Karpathy: Building micrograd",
                url: "https://youtu.be/VMj-3S1tku0",
                type: "video",
                quality: "recommended",
                free: true,
                note: "",
              },
            ],
          },
        ],
        generated_from: "model-knowledge",
        generated_at: "2026-01-01T00:00:00Z",
      },
    });

    const result = buildConceptQueue([makeConcept("c1", "Backprop")], state);
    expect(result).toContain("3Blue1Brown: Backpropagation");
    expect(result).toContain("Karpathy: Building micrograd");
  });

  it("concept with no resources shows 'Resources: none'", () => {
    const state = makeDomainState({
      curriculum: {
        concepts: [
          {
            id: "c1",
            title: "Concept Without Resources",
            description: "",
            prerequisites: [],
            difficulty_estimate: 1,
            source_refs: [],
            resources: [],
          },
        ],
        generated_from: "model-knowledge",
        generated_at: "2026-01-01T00:00:00Z",
      },
    });

    const result = buildConceptQueue(
      [makeConcept("c1", "Concept Without Resources")],
      state,
    );
    expect(result).toContain("Resources: none");
  });

  it("concept not found in curriculum curriculum shows 'Resources: none' (no crash)", () => {
    // Stale progress: concept was removed from curriculum but FSRS card remains
    const state = makeDomainState({}); // empty curriculum

    const result = buildConceptQueue(
      [makeConcept("deleted-concept", "Ghost Concept")],
      state,
    );
    // Must not throw, must produce graceful fallback
    expect(result).toContain("Resources: none");
    expect(result).toContain("Ghost Concept");
  });
});

// ---------------------------------------------------------------------------
// Lesson plan status
// ---------------------------------------------------------------------------

describe("buildConceptQueue — lesson plan status (task 3.1)", () => {
  it("concept with valid lesson_plan_path shows 'plan: exists at <path>'", () => {
    const planPath = join(tempDir, "backprop.md");
    writeFileSync(planPath, "# Backprop lesson plan", "utf-8");

    const state = makeDomainState({
      progress: {
        c1: {
          mastery: "introduced",
          fsrs_card: {} as never,
          struggle_points: [],
          confusion_pairs: [],
          assignments: [],
          lesson_plan_path: planPath,
        },
      },
    });

    const result = buildConceptQueue(
      [makeConcept("c1", "Backprop", 2, "introduced")],
      state,
    );
    expect(result).toContain(`plan: exists at ${planPath}`);
    expect(result).not.toContain("plan: none");
  });

  it("concept with lesson_plan_path set but file deleted shows 'plan: none'", () => {
    // File intentionally never created — simulates deletion after plan was generated
    const stalePath = join(tempDir, "deleted-plan.md");

    const state = makeDomainState({
      progress: {
        c1: {
          mastery: "introduced",
          fsrs_card: {} as never,
          struggle_points: [],
          confusion_pairs: [],
          assignments: [],
          lesson_plan_path: stalePath,
        },
      },
    });

    const result = buildConceptQueue(
      [makeConcept("c1", "Stale Plan Concept", 2, "introduced")],
      state,
    );
    // Must not show the stale path — coaching model would believe plan exists
    expect(result).toContain("plan: none");
    expect(result).not.toContain(stalePath);
  });

  it("concept with no progress entry shows 'plan: none'", () => {
    const state = makeDomainState({
      progress: {}, // no entry for concept_id "c1"
    });

    const result = buildConceptQueue([makeConcept("c1", "New Concept")], state);
    expect(result).toContain("plan: none");
  });
});
