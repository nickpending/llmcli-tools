import { describe, test, expect } from "bun:test";
import { parseScore } from "../../lib/score";
import type { RubricConfig } from "../../lib/types";

const testRubric: RubricConfig = {
  name: "test-rubric",
  passThreshold: 0.8,
  criteria: [
    {
      name: "Clarity",
      weight: 0.6,
      description: "Clear and structured.",
      examples: { good: "good example", bad: "bad example" },
    },
    {
      name: "Completeness",
      weight: 0.4,
      description: "Covers all sections.",
      examples: { good: "good example", bad: "bad example" },
    },
  ],
};

const baseMeta = {
  model: "claude-3-5-haiku-20241022",
  tokens: { input: 1000, output: 200 },
  durationMs: 1500,
  artifactPath: "/path/to/artifact.md",
};

describe("parseScore", () => {
  test("parses valid JSON response and computes weighted score", () => {
    const rawText = JSON.stringify({
      criteria: [
        { name: "Clarity", score: 0.9, feedback: "Well structured" },
        { name: "Completeness", score: 0.8, feedback: "Covers most sections" },
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.passed).toBe(true);
    // 0.9 * 0.6 + 0.8 * 0.4 = 0.54 + 0.32 = 0.86
    expect(result.score).toBe(0.86);
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0].weighted).toBe(0.9 * 0.6);
    expect(result.criteria[1].weighted).toBe(0.8 * 0.4);
  });

  test("returns passed: false when below threshold", () => {
    const rawText = JSON.stringify({
      criteria: [
        { name: "Clarity", score: 0.5, feedback: "Unclear" },
        { name: "Completeness", score: 0.3, feedback: "Incomplete" },
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    // 0.5 * 0.6 + 0.3 * 0.4 = 0.30 + 0.12 = 0.42
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.42);
  });

  test("handles markdown-wrapped JSON", () => {
    const rawText =
      '```json\n{"criteria": [{"name": "Clarity", "score": 0.9, "feedback": "Good"}, {"name": "Completeness", "score": 0.85, "feedback": "Complete"}]}\n```';

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.score).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  test("matches criteria names case-insensitively", () => {
    const rawText = JSON.stringify({
      criteria: [
        { name: "CLARITY", score: 0.9, feedback: "Good" },
        { name: "completeness", score: 0.8, feedback: "Good" },
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.criteria[0].score).toBe(0.9);
    expect(result.criteria[1].score).toBe(0.8);
    expect(result.error).toBeUndefined();
  });

  test("returns error on invalid JSON", () => {
    const result = parseScore("not json at all", testRubric, baseMeta);

    expect(result.passed).toBe(false);
    expect(result.error).toContain("Failed to parse JSON");
  });

  test("returns error when criteria array is missing", () => {
    const rawText = JSON.stringify({ scores: [] });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.passed).toBe(false);
    expect(result.error).toContain("missing 'criteria' array");
  });

  test("scores missing criterion as 0 and forces error + fail", () => {
    const rawText = JSON.stringify({
      criteria: [
        { name: "Clarity", score: 0.9, feedback: "Good" },
        // Missing Completeness
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.criteria[1].score).toBe(0);
    expect(result.criteria[1].feedback).toContain("No score returned");
    expect(result.passed).toBe(false);
    expect(result.error).toContain("Partial grading");
    expect(result.error).toContain("Completeness");
  });

  test("clamps scores to 0-1 range", () => {
    const rawText = JSON.stringify({
      criteria: [
        { name: "Clarity", score: 1.5, feedback: "Too high" },
        { name: "Completeness", score: -0.2, feedback: "Too low" },
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.criteria[0].score).toBe(1.0);
    expect(result.criteria[1].score).toBe(0);
  });

  test("boundary: exact threshold passes", () => {
    // Need exactly 0.8 weighted: 0.8 * 0.6 + 0.8 * 0.4 = 0.48 + 0.32 = 0.80
    const rawText = JSON.stringify({
      criteria: [
        { name: "Clarity", score: 0.8, feedback: "Meets threshold" },
        { name: "Completeness", score: 0.8, feedback: "Meets threshold" },
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.score).toBe(0.8);
    expect(result.passed).toBe(true);
  });

  test("populates metadata fields", () => {
    const rawText = JSON.stringify({
      criteria: [
        { name: "Clarity", score: 0.9, feedback: "Good" },
        { name: "Completeness", score: 0.8, feedback: "Good" },
      ],
    });

    const result = parseScore(rawText, testRubric, baseMeta);

    expect(result.rubric).toBe("test-rubric");
    expect(result.artifactPath).toBe("/path/to/artifact.md");
    expect(result.model).toBe("claude-3-5-haiku-20241022");
    expect(result.tokens.input).toBe(1000);
    expect(result.tokens.output).toBe(200);
    expect(result.durationMs).toBe(1500);
    expect(result.threshold).toBe(0.8);
  });
});
