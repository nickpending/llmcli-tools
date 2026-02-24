import { describe, test, expect } from "bun:test";
import { loadRubric } from "../../lib/rubric";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "..", "fixtures");

describe("loadRubric", () => {
  test("loads valid rubric from absolute path", async () => {
    const rubric = await loadRubric(join(FIXTURES, "task-plan-quality.yaml"));

    expect(rubric.name).toBe("task-plan-quality");
    expect(rubric.passThreshold).toBe(0.8);
    expect(rubric.criteria).toHaveLength(4);
  });

  test("criteria have required fields", async () => {
    const rubric = await loadRubric(join(FIXTURES, "task-plan-quality.yaml"));

    for (const criterion of rubric.criteria) {
      expect(typeof criterion.name).toBe("string");
      expect(criterion.name.length).toBeGreaterThan(0);
      expect(typeof criterion.weight).toBe("number");
      expect(criterion.weight).toBeGreaterThan(0);
      expect(criterion.weight).toBeLessThanOrEqual(1);
      expect(typeof criterion.description).toBe("string");
      expect(criterion.description.length).toBeGreaterThan(0);
      expect(typeof criterion.examples.good).toBe("string");
      expect(typeof criterion.examples.bad).toBe("string");
    }
  });

  test("weights sum to 1.0", async () => {
    const rubric = await loadRubric(join(FIXTURES, "task-plan-quality.yaml"));
    const weightSum = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);

    expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.01);
  });

  test("resolves bare name from ~/.sable/rubrics/", async () => {
    const rubric = await loadRubric("task-plan-quality");

    expect(rubric.name).toBe("task-plan-quality");
    expect(rubric.criteria.length).toBeGreaterThan(0);
  });

  test("throws on missing rubric file", async () => {
    await expect(
      loadRubric(join(FIXTURES, "nonexistent.yaml")),
    ).rejects.toThrow("Rubric file not found");
  });

  test("throws on missing bare name", async () => {
    await expect(loadRubric("nonexistent-rubric")).rejects.toThrow(
      'Rubric "nonexistent-rubric" not found',
    );
  });
});
