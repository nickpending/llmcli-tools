/**
 * llm-summarize - Library exports
 *
 * Structured session insight extraction for knowledge systems.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { summarize, loadConfig } from "llm-summarize";
 *   const config = loadConfig();
 *   const result = await summarize("session transcript", config);
 *   // result.insights.summary, result.insights.decisions, etc.
 */

import { complete } from "@voidwire/llm-core";

// ============================================================================
// Types
// ============================================================================

export interface Extraction {
  term: string;
  type: "project" | "topic" | "tool" | "person";
  confidence: "high" | "medium";
}

export interface SessionInsights {
  summary: string;
  // Optional fields populated by custom prompts (e.g., Lore injection)
  extractions?: Extraction[];
  keywords?: string[];
  // Insights mode fields (delta extraction)
  current_focus?: string;
  next_steps?: string[];
  decisions?: string[];
  corrections?: string[];
  validated?: string[];
  problems_solved?: string[];
  // Legacy fields — kept for backward compatibility with existing session JSONL data
  patterns_used?: string[];
  preferences_expressed?: string[];
}

export interface SummarizeResult {
  insights?: SessionInsights;
  rawText?: string;
  error?: string;
  model?: string;
  tokens_used?: number;
}

export interface SummarizeConfig {
  service?: string; // Named service from services.toml (optional, uses default_service)
  model?: string; // Model override — falls back to service default_model if omitted
  maxTokens: number; // Max output tokens
}

export interface SummarizeOptions {
  model?: string;
  maxTokens?: number;
  mode?: "quick" | "insights";
  /** User name to include in summary (e.g., "Rudy") */
  userName?: string;
  /** Override the system prompt (bypasses mode-based prompt selection) */
  systemPrompt?: string;
}

export type SummarizeMode = "quick" | "insights";

// ============================================================================
// System Prompts
// ============================================================================

/**
 * Build quick mode prompt with optional user name
 */
function buildQuickPrompt(userName?: string): string {
  const nameInstruction = userName ? `Start with "${userName}".` : "";

  return `Summarize what the user is asking or doing in one sentence.
${nameInstruction}
Output JSON only: {"summary": "One sentence summary"}`;
}

/**
 * Build insights mode prompt for session insight extraction
 * Note: userName param kept for API compatibility but not used in insights mode
 */
function buildInsightsPrompt(_userName?: string): string {
  return `You are a session delta extractor. Given a development conversation and the previous state snapshot, extract ONLY what is NEW since the last snapshot.

<instructions>
1. Read the <previous_state> section — this is what was already known
2. Read the <transcript> section — this is what happened since
3. Extract ONLY new information not already captured in previous_state
4. Skip any lines containing markers (📁 CAPTURE, 📚 TEACH, 👤 OBSERVE, 🗣️, ─── REFLECT) — these are handled by a separate system
5. Focus on: what decisions were made, what changed direction, what the user corrected, what approach was validated
6. Produce a JSON delta object
</instructions>

<fields>
- summary: One sentence — what CHANGED since last snapshot, not a re-summary of the whole session
- current_focus: The specific task or topic right now (omit if unchanged from previous_state)
- decisions: New decisions only — include the rationale ("X because Y"). Skip if already in previous_state.
- corrections: Things the user pushed back on or redirected. Quote their words when possible.
- validated: Approaches the user approved or confirmed worked. Only when non-obvious.
- next_steps: Concrete next actions that emerged THIS turn. Name specifics.
- problems_solved: New problems with root cause and fix. Skip re-statements.
</fields>

<rules>
- If nothing meaningful changed since previous_state, return {"summary": "continuation", "current_focus": "unchanged"}
- NEVER repeat information from previous_state — this is a delta, not a snapshot
- "User clarified X" is NOT a correction — only record corrections when the user explicitly redirects, rejects, or changes direction
- Every field value must be specific enough to be useful 6 months from now without context
</rules>

<example>
<input>
<previous_state>
## Context
- **Focus:** JWT authentication implementation
- Chose JWT over sessions — eliminates Redis dependency
## Next
- Test refresh token flow
</previous_state>
<transcript>
User: Actually let's use sessions after all — the team is more familiar with them and we already have Redis in prod
Assistant: Switched back to express-session with Redis store. Removed the JWT middleware.
User: Good. And make the session timeout 8 hours not the default 24.
</transcript>
</input>
<output>
{"summary":"Reversed JWT decision back to sessions — team familiarity and existing Redis infra","current_focus":"Session-based authentication","decisions":["Reverted to express-session with Redis — team familiarity with sessions outweighs JWT's statelessness benefit, Redis already in production"],"corrections":["User reversed the JWT decision after initial implementation — team constraints weren't considered"],"next_steps":["Configure 8-hour session timeout","Remove JWT dependencies"]}
</output>
</example>

<example>
<input>
<previous_state>
## Context
- **Focus:** Debugging webhook test failures
- Fixed hardcoded timestamp in tests
## Next
- Verify CI passes
</previous_state>
<transcript>
User: CI is green now. Let's move on to the API rate limiter.
Assistant: Starting on the rate limiter. I'll use a sliding window approach with Redis.
User: Sounds good.
</transcript>
</input>
<output>
{"summary":"CI fixed, pivoted to API rate limiter","current_focus":"API rate limiter implementation","validated":["Sliding window rate limiting with Redis — user approved without pushback"],"next_steps":["Implement sliding window rate limiter with Redis"]}
</output>
</example>

Output valid JSON only.`;
}

/**
 * Get prompt for the specified mode
 */
function getPromptForMode(mode: SummarizeMode, userName?: string): string {
  return mode === "quick"
    ? buildQuickPrompt(userName)
    : buildInsightsPrompt(userName);
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Extract JSON from LLM response that may contain:
 * - Markdown code blocks (```json ... ```)
 * - MLX end tokens (<|im_end|>, <|end|>)
 * - Thinking blocks (<think>...</think>)
 * - Raw JSON
 */
function extractJson(raw: string): SessionInsights | null {
  let text = raw.trim();

  // Remove thinking blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Remove MLX end tokens
  text = text
    .replace(/<\|im_end\|>/g, "")
    .replace(/<\|end\|>/g, "")
    .trim();

  // Extract from markdown code block if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Find JSON object in text (handle leading/trailing garbage)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate required field
    if (typeof parsed.summary !== "string") {
      return null;
    }
    return parsed as SessionInsights;
  } catch {
    return null;
  }
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load configuration for llm-summarize.
 *
 * Service and model are resolved by llm-core from services.toml.
 * Override service/model here only when llm-summarize needs to
 * differ from the default_service and its default_model.
 *
 * To configure:
 *   1. Set up services: ~/.config/llm-core/services.toml (with default_model per service)
 *   2. Set up API keys: ~/.config/apiconf/config.toml (for cloud services)
 *   3. Optionally override service/model/maxTokens via SummarizeOptions
 */
export function loadConfig(): SummarizeConfig {
  return {
    maxTokens: 1024,
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Summarize text using configured LLM
 *
 * @param text - Text to summarize
 * @param config - Summarize configuration (from loadConfig())
 * @param options - Optional overrides for model, maxTokens, and mode
 * @returns SummarizeResult with insights or error
 *
 * Modes:
 * - "quick": Fast one-liner summary (for user prompts)
 * - "insights": Full SessionInsights extraction (for responses, default)
 */
export async function summarize(
  text: string,
  config: SummarizeConfig,
  options?: SummarizeOptions,
): Promise<SummarizeResult> {
  try {
    const mode: SummarizeMode = options?.mode || "insights";
    const userName = options?.userName;
    const systemPrompt =
      options?.systemPrompt || getPromptForMode(mode, userName);
    // Model resolution: options.model > config.model > service default_model (in llm-core)
    const model = options?.model || config.model;

    const result = await complete({
      service: config.service,
      model,
      prompt: text,
      systemPrompt,
      maxTokens: options?.maxTokens || config.maxTokens,
      temperature: 0.3,
    });

    const insights = extractJson(result.text);

    if (!insights) {
      return {
        error: "Failed to parse insights from response",
        rawText: result.text,
      };
    }

    return {
      insights,
      rawText: result.text,
      model: result.model,
      tokens_used: result.tokens.output,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { error };
  }
}
