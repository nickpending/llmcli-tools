import { describe, test, expect } from "bun:test";
import { buildGradingPrompt } from "../../lib/prompt";
import type { RubricConfig } from "../../lib/types";

const testRubric: RubricConfig = {
  name: "test-rubric",
  passThreshold: 0.8,
  criteria: [
    {
      name: "Clarity",
      weight: 0.6,
      description: "The artifact is clear and well-structured.",
      examples: {
        good: "Well-organized with headers, specific details, and concrete examples.",
        bad: "Vague, no structure, no specifics.",
      },
    },
    {
      name: "Completeness",
      weight: 0.4,
      description: "The artifact covers all required sections.",
      examples: {
        good: "All sections present with meaningful content.",
        bad: "Missing multiple sections or sections are empty.",
      },
    },
  ],
};

describe("buildGradingPrompt", () => {
  test("system prompt includes scoring instructions", () => {
    const { system } = buildGradingPrompt(testRubric, "test artifact");

    expect(system).toContain("artifact quality evaluator");
    expect(system).toContain("0.0 to 1.0");
    expect(system).toContain("Return ONLY valid JSON");
  });

  test("system prompt includes all criteria", () => {
    const { system } = buildGradingPrompt(testRubric, "test artifact");

    expect(system).toContain("### Clarity (weight: 0.6)");
    expect(system).toContain("### Completeness (weight: 0.4)");
  });

  test("system prompt includes good and bad examples", () => {
    const { system } = buildGradingPrompt(testRubric, "test artifact");

    expect(system).toContain("GOOD example:");
    expect(system).toContain("Well-organized with headers");
    expect(system).toContain("BAD example:");
    expect(system).toContain("Vague, no structure");
  });

  test("system prompt includes score anchors", () => {
    const { system } = buildGradingPrompt(testRubric, "test artifact");

    expect(system).toContain("1.0: Fully meets the criterion");
    expect(system).toContain("0.7-0.9: Mostly meets it");
    expect(system).toContain("0.4-0.6: Partially meets it");
    expect(system).toContain("0.0-0.3: Fails to meet it");
  });

  test("user prompt contains artifact text", () => {
    const artifactText = "This is my plan\nWith multiple lines";
    const { user } = buildGradingPrompt(testRubric, artifactText);

    expect(user).toContain("## Artifact to Score");
    expect(user).toContain(artifactText);
  });

  test("criteria order matches rubric order", () => {
    const { system } = buildGradingPrompt(testRubric, "test");

    const clarityIndex = system.indexOf("### Clarity");
    const completenessIndex = system.indexOf("### Completeness");

    expect(clarityIndex).toBeLessThan(completenessIndex);
  });
});
