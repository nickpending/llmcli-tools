/**
 * lib/eval.ts - Main evaluation orchestrator
 *
 * Coordinates the full eval pipeline: load rubric, read artifact,
 * build prompt, call LLM, parse score. Single entry point for callers.
 */

import { complete } from "@voidwire/llm-core";
import { loadRubric } from "./rubric";
import { buildGradingPrompt } from "./prompt";
import { parseScore } from "./score";
import type { EvalResult } from "./types";

const SERVICE_NAME = "sable-eval";
const DEFAULT_MAX_TOKENS = 2048;

export interface ScoreArtifactOptions {
  maxTokens?: number;
}

/**
 * Score an artifact against a rubric using LLM evaluation.
 *
 * Orchestrates the full pipeline:
 * 1. Load and validate rubric
 * 2. Read artifact file
 * 3. Build grading prompt with criteria, examples, and scale anchors
 * 4. Call LLM (Haiku by default, temperature 0)
 * 5. Parse per-criterion scores and compute weighted aggregate
 *
 * @param rubricPath - Bare name, relative path, or absolute path to rubric YAML
 * @param artifactPath - Absolute path to artifact file to score
 * @param options - Optional maxTokens override
 * @returns EvalResult with pass/fail, score, per-criterion detail
 */
export async function scoreArtifact(
  rubricPath: string,
  artifactPath: string,
  options?: ScoreArtifactOptions,
): Promise<EvalResult> {
  const startTime = Date.now();

  // 1. Load rubric
  const rubric = await loadRubric(rubricPath);

  // 2. Read artifact
  const artifactFile = Bun.file(artifactPath);
  if (!(await artifactFile.exists())) {
    throw new Error(`Artifact file not found: ${artifactPath}`);
  }
  const artifactText = await artifactFile.text();

  // 3. Build grading prompt
  const { system, user } = buildGradingPrompt(rubric, artifactText);

  // 4. Call LLM via sable-eval service (model configured in services.toml)
  const result = await complete({
    systemPrompt: system,
    prompt: user,
    service: SERVICE_NAME,
    maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0,
  });

  const durationMs = Date.now() - startTime;

  // 5. Parse and return
  return parseScore(result.text, rubric, {
    model: result.model,
    tokens: result.tokens,
    durationMs,
    artifactPath,
  });
}
