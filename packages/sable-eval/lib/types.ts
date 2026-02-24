/**
 * lib/types.ts - All TypeScript types for sable-eval
 *
 * Rubric configuration, criterion definitions, and evaluation results.
 */

export interface Criterion {
  name: string;
  weight: number;
  description: string;
  examples: {
    good: string;
    bad: string;
  };
}

export interface RubricConfig {
  name: string;
  passThreshold: number; // 0.0-1.0 (e.g., 0.8)
  criteria: Criterion[];
}

export interface CriterionScore {
  name: string;
  weight: number;
  score: number; // 0.0-1.0
  feedback: string;
  weighted: number; // score * weight
}

export interface EvalResult {
  rubric: string;
  artifactPath: string;
  passed: boolean;
  score: number; // 0.0-1.0 weighted aggregate
  threshold: number;
  criteria: CriterionScore[];
  model: string;
  tokens: { input: number; output: number };
  durationMs: number;
  error?: string;
}
