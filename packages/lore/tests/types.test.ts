import { describe, expect, test } from "bun:test";
import { LoreType, LORE_TYPES, isValidLoreType } from "../index";

const EXPECTED_TYPES = [
  "gotcha",
  "decision",
  "pattern",
  "learning",
  "preference",
  "term",
  "style",
  "teaching",
  "task",
  "todo",
  "idea",
  "knowledge",
  "insight",
  "summary",
  "observation",
  "context",
  "completion",
  "problem",
  "tool",
];

describe("LoreType enum", () => {
  test("has all 19 type values", () => {
    const values = Object.values(LoreType);
    expect(values).toHaveLength(19);
    for (const type of EXPECTED_TYPES) {
      expect(values).toContain(type);
    }
  });

  test("enum keys map to correct lowercase values", () => {
    expect(LoreType.Gotcha).toBe("gotcha");
    expect(LoreType.Decision).toBe("decision");
    expect(LoreType.Pattern).toBe("pattern");
    expect(LoreType.Learning).toBe("learning");
    expect(LoreType.Preference).toBe("preference");
    expect(LoreType.Term).toBe("term");
    expect(LoreType.Style).toBe("style");
    expect(LoreType.Teaching).toBe("teaching");
    expect(LoreType.Task).toBe("task");
    expect(LoreType.Todo).toBe("todo");
    expect(LoreType.Idea).toBe("idea");
    expect(LoreType.Knowledge).toBe("knowledge");
    expect(LoreType.Insight).toBe("insight");
    expect(LoreType.Summary).toBe("summary");
    expect(LoreType.Observation).toBe("observation");
    expect(LoreType.Context).toBe("context");
    expect(LoreType.Completion).toBe("completion");
    expect(LoreType.Problem).toBe("problem");
    expect(LoreType.Tool).toBe("tool");
  });
});

describe("LORE_TYPES array", () => {
  test("contains exactly 19 values matching enum", () => {
    expect(LORE_TYPES).toHaveLength(19);
    const enumValues = Object.values(LoreType);
    for (const type of LORE_TYPES) {
      expect(enumValues).toContain(type);
    }
  });
});

describe("isValidLoreType", () => {
  test("accepts all valid types", () => {
    for (const type of EXPECTED_TYPES) {
      expect(isValidLoreType(type)).toBe(true);
    }
  });

  test("rejects invalid strings", () => {
    expect(isValidLoreType("invalid")).toBe(false);
    expect(isValidLoreType("")).toBe(false);
    expect(isValidLoreType("GOTCHA")).toBe(false);
    expect(isValidLoreType("Decision")).toBe(false);
  });
});
