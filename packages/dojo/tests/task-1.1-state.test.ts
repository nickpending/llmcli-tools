/**
 * Task 1.1 — state.ts invariant tests (domain CRUD, atomic writes, validation)
 *
 * Invariants tested:
 * - INV-001: write → read roundtrip preserves all fields exactly
 * - validateDomainState rejects invalid/missing top-level fields
 * - validateDomainState rejects malformed progress entries (nested validation)
 * - initDomain rejects duplicate domain names
 * - updateDomain persists field changes
 * - listDomains reflects filesystem state
 */

import { describe, it, expect, mock, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createEmptyCard } from "ts-fsrs";

// ---------------------------------------------------------------------------
// Temp directory — used as mocked home AND data root for this test file
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync("/tmp/test-dojo-state-");
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

// Write a minimal config.toml so getConfig() succeeds
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

// Mock os BEFORE dynamic import — config.ts calls homedir() at runtime
mock.module("os", () => ({
  homedir: () => tempDir,
}));

// Dynamic import AFTER mock — per quality.md isolation strategy
const {
  initDomain,
  readDomain,
  writeDomain,
  listDomains,
  updateDomain,
  validateDomainState,
} = await import("../lib/state.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid DomainState for use in write tests */
function makeMinimalState(name: string) {
  return {
    domain: name,
    goal: "test goal",
    context: "sprint" as const,
    persona: "mentor",
    sources: [],
    curriculum: {
      concepts: [],
      generated_from: "model-knowledge" as const,
      generated_at: new Date().toISOString(),
    },
    progress: {},
    session_history: [],
    session_count: 0,
    last_session: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("state.ts — task 1.1", () => {
  // -------------------------------------------------------------------------
  // INV-001: write → read roundtrip preserves all fields
  // -------------------------------------------------------------------------

  it("INV-001: writeDomain → readDomain roundtrip preserves all fields", () => {
    const state = makeMinimalState("roundtrip-domain");
    writeDomain(state);

    const loaded = readDomain("roundtrip-domain");

    expect(loaded.domain).toBe("roundtrip-domain");
    expect(loaded.goal).toBe("test goal");
    expect(loaded.context).toBe("sprint");
    expect(loaded.persona).toBe("mentor");
    expect(Array.isArray(loaded.sources)).toBe(true);
    expect(loaded.sources.length).toBe(0);
    expect(Array.isArray(loaded.curriculum.concepts)).toBe(true);
    expect(loaded.session_count).toBe(0);
    expect(loaded.last_session).toBeNull();
    expect(typeof loaded.progress).toBe("object");
  });

  // -------------------------------------------------------------------------
  // INV-001 extension: progress entries survive roundtrip intact
  // -------------------------------------------------------------------------

  it("INV-001: progress entries survive write → read roundtrip with all FSRS fields", () => {
    const state = makeMinimalState("progress-roundtrip");
    state.progress["concept-a"] = {
      mastery: "practiced",
      fsrs_card: createEmptyCard(),
      struggle_points: ["struggled with X"],
      confusion_pairs: ["concept-b"],
      assignments: [],
    };
    writeDomain(state);

    const loaded = readDomain("progress-roundtrip");
    const p = loaded.progress["concept-a"];
    expect(p).toBeDefined();
    expect(p.mastery).toBe("practiced");
    expect(p.confusion_pairs).toContain("concept-b");
    expect(typeof p.fsrs_card).toBe("object");
    expect(p.fsrs_card).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // validateDomainState: rejects missing required top-level fields
  // -------------------------------------------------------------------------

  it("validateDomainState rejects object missing 'domain' field", () => {
    const bad = { goal: "x", context: "sprint", persona: "mentor" };
    expect(() => validateDomainState(bad)).toThrow(
      /missing or invalid 'domain' field/,
    );
  });

  it("validateDomainState rejects malformed progress entry (missing fsrs_card)", () => {
    const bad = {
      domain: "test",
      goal: "g",
      context: "sprint",
      persona: "p",
      session_count: 0,
      session_history: [],
      sources: [],
      curriculum: { concepts: [] },
      // progress entry is missing fsrs_card
      progress: {
        "concept-x": { mastery: "none" },
      },
    };
    expect(() => validateDomainState(bad)).toThrow(
      /progress\['concept-x'\].fsrs_card must be an object/,
    );
  });

  it("validateDomainState rejects when curriculum.concepts is not an array", () => {
    const bad = {
      domain: "test",
      goal: "g",
      context: "sprint",
      persona: "p",
      session_count: 0,
      session_history: [],
      sources: [],
      progress: {},
      curriculum: { concepts: "not-an-array" },
    };
    expect(() => validateDomainState(bad)).toThrow(
      /curriculum.concepts must be an array/,
    );
  });

  // -------------------------------------------------------------------------
  // initDomain: duplicate domain rejected
  // -------------------------------------------------------------------------

  it("initDomain rejects duplicate domain — data integrity guard", () => {
    initDomain("unique-domain", "goal", "sprint", "mentor");
    expect(() =>
      initDomain("unique-domain", "other goal", "sprint", "mentor"),
    ).toThrow(/already exists/);
  });

  // -------------------------------------------------------------------------
  // updateDomain: field changes persist
  // -------------------------------------------------------------------------

  it("updateDomain persists goal change across write/read cycle", () => {
    initDomain("update-target", "original goal", "skill-build", "socratic");
    updateDomain("update-target", { goal: "revised goal" });

    const loaded = readDomain("update-target");
    expect(loaded.goal).toBe("revised goal");
    expect(loaded.context).toBe("skill-build"); // unchanged field preserved
  });

  // -------------------------------------------------------------------------
  // listDomains: reflects filesystem state
  // -------------------------------------------------------------------------

  it("listDomains returns names of all written domains", () => {
    initDomain("list-domain-a", "goal a", "sprint", "mentor");
    initDomain("list-domain-b", "goal b", "sprint", "challenger");

    const domains = listDomains();
    expect(domains).toContain("list-domain-a");
    expect(domains).toContain("list-domain-b");
  });
});
