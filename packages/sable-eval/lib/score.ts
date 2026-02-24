/**
 * lib/score.ts - Score parser and aggregator
 *
 * Parses LLM JSON response into per-criterion scores,
 * computes weighted aggregate, and determines pass/fail.
 * Never throws — returns EvalResult with error field on failure.
 */

import { extractJson } from "@voidwire/llm-core";
import type { RubricConfig, CriterionScore, EvalResult } from "./types";

interface GradingResponse {
  criteria: Array<{
    name: string;
    score: number;
    feedback: string;
  }>;
}

interface ScoreMeta {
  model: string;
  tokens: { input: number; output: number };
  durationMs: number;
  artifactPath: string;
}

/**
 * Parse LLM grading response and compute evaluation result.
 *
 * Uses extractJson from llm-core to strip markdown blocks.
 * Matches criteria by name (case-insensitive trim).
 * Returns EvalResult with error field on parse failure — never throws.
 *
 * @param rawText - Raw text from LLM response
 * @param rubric - Rubric used for grading
 * @param meta - Metadata from the LLM call
 * @returns Complete EvalResult
 */
export function parseScore(
  rawText: string,
  rubric: RubricConfig,
  meta: ScoreMeta,
): EvalResult {
  const baseResult: EvalResult = {
    rubric: rubric.name,
    artifactPath: meta.artifactPath,
    passed: false,
    score: 0,
    threshold: rubric.passThreshold,
    criteria: [],
    model: meta.model,
    tokens: meta.tokens,
    durationMs: meta.durationMs,
  };

  // Extract JSON from response
  const parsed = extractJson<GradingResponse>(rawText);
  if (!parsed) {
    return {
      ...baseResult,
      error: "Failed to parse JSON from LLM response",
    };
  }

  // Validate response shape
  if (!Array.isArray(parsed.criteria)) {
    return {
      ...baseResult,
      error: "LLM response missing 'criteria' array",
    };
  }

  // Match response criteria to rubric criteria by name
  const criteriaScores: CriterionScore[] = [];
  const missingCriteria: string[] = [];

  for (const rubricCriterion of rubric.criteria) {
    const rubricNameLower = rubricCriterion.name.toLowerCase().trim();

    const match = parsed.criteria.find(
      (rc) =>
        typeof rc.name === "string" &&
        rc.name.toLowerCase().trim() === rubricNameLower,
    );

    if (!match) {
      missingCriteria.push(rubricCriterion.name);
      criteriaScores.push({
        name: rubricCriterion.name,
        weight: rubricCriterion.weight,
        score: 0,
        feedback: "No score returned by evaluator",
        weighted: 0,
      });
      continue;
    }

    // Validate score range
    const score =
      typeof match.score === "number"
        ? Math.max(0, Math.min(1, match.score))
        : 0;
    const feedback = typeof match.feedback === "string" ? match.feedback : "";

    criteriaScores.push({
      name: rubricCriterion.name,
      weight: rubricCriterion.weight,
      score,
      feedback,
      weighted: score * rubricCriterion.weight,
    });
  }

  // Compute weighted aggregate
  const totalScore = criteriaScores.reduce((sum, cs) => sum + cs.weighted, 0);
  const passed = totalScore >= rubric.passThreshold;

  // Signal partial grading as error — caller should treat as tool failure, not quality failure
  const error =
    missingCriteria.length > 0
      ? `Partial grading: LLM did not score: ${missingCriteria.join(", ")}`
      : undefined;

  return {
    ...baseResult,
    passed: error ? false : passed,
    score: Math.round(totalScore * 100) / 100,
    criteria: criteriaScores,
    error,
  };
}
