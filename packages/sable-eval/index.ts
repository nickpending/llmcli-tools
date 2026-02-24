/**
 * sable-eval - Rubric-based artifact scoring tool for SABLE agents
 *
 * Loads rubric YAML, builds a grading prompt, calls llm-core with Haiku
 * at temperature 0, and parses per-criterion JSON scores into a pass/fail
 * result with weighted aggregate.
 *
 * Usage:
 *   import { scoreArtifact, loadRubric } from "@voidwire/sable-eval";
 *   const result = await scoreArtifact("task-plan-quality", "/path/to/plan.md");
 *   // result.passed, result.score, result.criteria
 */

export type {
  RubricConfig,
  Criterion,
  EvalResult,
  CriterionScore,
} from "./lib/types";

export { loadRubric } from "./lib/rubric";
export { buildGradingPrompt } from "./lib/prompt";
export { parseScore } from "./lib/score";
export { scoreArtifact } from "./lib/eval";
