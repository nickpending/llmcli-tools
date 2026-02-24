/**
 * lib/prompt.ts - Grading prompt builder
 *
 * Builds system and user prompts from a rubric config and artifact text.
 * The system prompt instructs the LLM to score each criterion on 0.0-1.0
 * with anchor descriptions and concrete good/bad examples to combat score compression.
 */

import type { RubricConfig } from "./types";

/**
 * Build grading prompts from rubric and artifact text.
 *
 * @param rubric - Validated rubric configuration
 * @param artifactText - Raw text of the artifact to evaluate
 * @returns System prompt and user prompt for LLM grading call
 */
export function buildGradingPrompt(
  rubric: RubricConfig,
  artifactText: string,
): { system: string; user: string } {
  const criteriaBlock = rubric.criteria
    .map(
      (c) =>
        `### ${c.name} (weight: ${c.weight})\n${c.description.trim()}\n\nGOOD example:\n${c.examples.good.trim()}\n\nBAD example:\n${c.examples.bad.trim()}`,
    )
    .join("\n\n");

  const system = `You are an artifact quality evaluator. Score the provided artifact against each criterion.

For each criterion, assign a score from 0.0 to 1.0:
- 1.0: Fully meets the criterion
- 0.7-0.9: Mostly meets it with minor gaps
- 0.4-0.6: Partially meets it, significant gaps
- 0.0-0.3: Fails to meet it

Return ONLY valid JSON with no markdown wrapping:
{
  "criteria": [
    {
      "name": "<criterion name>",
      "score": <0.0-1.0>,
      "feedback": "<1-2 sentences: what was present and what was missing>"
    }
  ]
}

Criteria to evaluate:

${criteriaBlock}`;

  const user = `## Artifact to Score

${artifactText}`;

  return { system, user };
}
