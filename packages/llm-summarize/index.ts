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

export interface Signal {
  type: string; // canonical: gotcha, decision, discovery, pattern, preference, style, term, teaching
  topic: string;
  content: string;
}

export interface SessionInsights {
  summary: string;
  // Optional fields populated by custom prompts (e.g., Lore injection)
  extractions?: Extraction[];
  keywords?: string[];
  // Insights mode fields (delta extraction)
  current_focus?: string;
  next_steps?: string[];
  signals?: Signal[];
  satisfaction?: number; // 1-10 per-turn satisfaction score
  // Legacy — kept for backward compat with existing session JSONL
  decisions?: string[];
  corrections?: string[];
  validated?: string[];
  problems_solved?: string[];
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
5. Focus on: what decisions were made, what changed direction, what was learned, what the user corrected or validated
6. Produce a JSON delta object
</instructions>

<fields>
- summary: One sentence — what CHANGED since last snapshot, not a re-summary of the whole session
- current_focus: The specific task or topic right now (omit if unchanged from previous_state)
- next_steps: Concrete next actions that emerged THIS turn. Name specifics.
- signals: Array of observations from this turn. Each signal has:
  - type: One of the canonical types — gotcha, decision, discovery, pattern, preference, style, term, teaching
  - topic: The project, tool, or domain this relates to (e.g., "sable", "typescript", "auth module")
  - content: Specific, self-contained description useful 6 months from now without context
- satisfaction: Integer 1-10. Calibration:
  - 1-2: User corrected the same thing twice, expressed frustration
  - 3-4: User redirected or pointed out an omission
  - 5-6: Neutral continuation, question asked, no strong signal either way
  - 7-8: User approved approach, gave trust signals ("go ahead", "do it")
  - 9-10: Explicit praise, user genuinely impressed
</fields>

<signal_types>
- gotcha: Something that broke or surprised — a trap for future developers
- decision: A deliberate choice with rationale ("X because Y")
- discovery: New finding about codebase, tool, or behavior
- pattern: A reusable approach or technique worth remembering
- preference: Something the user explicitly prefers or dislikes
- style: Code style, naming, or formatting preference
- term: Domain-specific terminology or naming convention
- teaching: The user explained something — capture the lesson
</signal_types>

<rules>
- If nothing meaningful changed since previous_state, return {"summary": "continuation", "current_focus": "unchanged", "signals": [], "satisfaction": 5}
- NEVER repeat information from previous_state — this is a delta, not a snapshot
- NEVER copy text from the examples below into your output — examples show structure only, your content must come exclusively from the transcript
- "User clarified X" is NOT a preference — only record preferences when the user explicitly states a preference or rejects an approach
- Every signal content must be specific enough to be useful 6 months from now without context
- Omit signal types that have no observations this turn — only include signals that actually occurred
- satisfaction is required on every response — estimate from the tone and corrections/validations ratio
</rules>

<example>
<input>
<previous_state>
## Context
- **Focus:** Spaceship navigation module
- Chose warp drive over hyperspace — fewer dimensional side effects
## Next
- Test warp field calculations
</previous_state>
<transcript>
User: Actually let's use hyperspace after all — the crew is more familiar with it and we already have the motivator installed
Assistant: Switched back to hyperspace engine with the existing motivator. Removed the warp field generator.
User: Good. And set the jump cooldown to 8 parsecs not the default 24.
</transcript>
</input>
<output>
{"summary":"Reversed warp drive decision back to hyperspace — crew familiarity and existing motivator hardware","current_focus":"Hyperspace navigation","signals":[{"type":"decision","topic":"navigation","content":"Reverted to hyperspace engine — crew familiarity outweighs warp drive benefits, motivator already installed"},{"type":"preference","topic":"navigation","content":"User reversed warp drive decision — crew constraints and existing hardware should take priority over theoretical benefits"},{"type":"preference","topic":"navigation","content":"Jump cooldown set to 8 parsecs instead of default 24"}],"satisfaction":6,"next_steps":["Configure 8-parsec jump cooldown","Remove warp field generator dependencies"]}
</output>
</example>

<example>
<input>
<previous_state>
## Context
- **Focus:** Debugging potion brewing test failures
- Fixed expired ingredient timestamp in tests
## Next
- Verify cauldron CI passes
</previous_state>
<transcript>
User: CI is green now. Let's move on to the invisibility cloak renderer.
Assistant: Starting on the cloak renderer. I'll use a phase-shift approach with mithril threading.
User: Sounds good.
</transcript>
</input>
<output>
{"summary":"Potion CI fixed, pivoted to invisibility cloak renderer","current_focus":"Invisibility cloak renderer implementation","signals":[{"type":"pattern","topic":"cloak renderer","content":"Phase-shift rendering with mithril threading — user approved the approach"}],"satisfaction":8,"next_steps":["Implement phase-shift cloak renderer with mithril threading"]}
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
