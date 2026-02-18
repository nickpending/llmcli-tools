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
  // Quick mode extraction fields
  should_search?: boolean;
  extractions?: Extraction[];
  // Insights mode fields
  current_focus?: string;
  next_steps?: string[];
  decisions?: string[];
  patterns_used?: string[];
  preferences_expressed?: string[];
  problems_solved?: string[];
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
  model: string; // Model name — required by complete()
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
 * Now includes context extraction for knowledge retrieval
 */
function buildQuickPrompt(userName?: string): string {
  const name = userName || "User";

  return `You are a context classifier for knowledge retrieval. Analyze conversation context to determine what prior knowledge would be valuable.

Input format:
Project: <project name>
Previous Assistant: <last assistant message>
User Prompt: <current user message>

Produce JSON with:
1. summary: Brief description (1-2 sentences) of what the user is doing/asking. Start with "${name}".
2. should_search: Whether to search the knowledge base
3. extractions: Terms worth searching for

should_search = true when:
- References past work, decisions, discussions
- Mentions project, tool, or person by name
- Asks "what was...", "how did we...", "remember when..."
- Technical domain benefits from prior learnings

should_search = false when:
- Greetings, acknowledgments ("ready", "thanks", "ok")
- Simple commands ("run tests", "commit this")
- Continuation signals ("yes", "do it", "go ahead")

Extraction types:
- project: Named codebase, repo, system (sable, lore, momentum)
- topic: Domain, concept, technical area (hooks, authentication, Tier 2)
- tool: Library, CLI, framework (llm-summarize, SQLite, Bun)
- person: Named individual

Confidence:
- high: Explicitly stated
- medium: Strongly implied

Skip generic words. Only extract terms that yield useful knowledge results.

<example>
Project: sable
Previous Assistant: I'll update the UserPromptSubmit hook to call llm-summarize.
User Prompt: What does Lore return for project queries?

{"summary": "${name} is asking about Lore's return format for project queries", "should_search": true, "extractions": [{"term": "Lore", "type": "project", "confidence": "high"}, {"term": "project queries", "type": "topic", "confidence": "high"}]}
</example>

<example>
Project: sable
Previous Assistant: The extraction prompt is ready. Should I add it?
User Prompt: yes do it

{"summary": "${name} is confirming to proceed with the extraction prompt", "should_search": false, "extractions": []}
</example>

<example>
Project: sable
Previous Assistant: Starting new session.
User Prompt: What was the issue we hit with the stop hook last time?

{"summary": "${name} is asking about a previous issue with the stop hook", "should_search": true, "extractions": [{"term": "stop hook", "type": "topic", "confidence": "high"}, {"term": "sable", "type": "project", "confidence": "medium"}]}
</example>

Output valid JSON only. No markdown, no explanation.`;
}

/**
 * Build insights mode prompt for session insight extraction
 * Note: userName param kept for API compatibility but not used in insights mode
 */
function buildInsightsPrompt(_userName?: string): string {
  return `You are a session state extractor. Given a development conversation, produce a JSON snapshot of the session's current state.

<instructions>
1. Read the conversation in the <transcript> section
2. Ignore the <previous_state> section — it is background context only, not part of this session
3. Extract ONLY what happened in the transcript
4. Produce a JSON object with the fields described below
</instructions>

<fields>
- summary: One sentence describing what was accomplished this session
- current_focus: The specific task or feature being worked on (omit if exploratory)
- next_steps: Array of concrete next actions. Name the specific task.
- decisions: Array of decisions made this session, each with rationale
- patterns_used: Array of techniques or approaches applied, each with context
- preferences_expressed: Array of user preferences revealed through direction or correction
- problems_solved: Array of problems encountered with root cause and fix
</fields>

Include a field only when the transcript contains clear evidence. Omit empty arrays. Every value must be a complete sentence.

<example>
<input>
<previous_state>Focus: Building authentication system</previous_state>
<transcript>
User Asked: Let's use JWT instead of sessions for auth
Assistant Response: Switched from express-session to jsonwebtoken. JWTs are stateless so we don't need Redis for session storage anymore. Updated the middleware to verify tokens on each request.
User Asked: Make sure the tokens expire after 24 hours
Assistant Response: Set expiresIn to 24h in the sign options. Also added a refresh token flow so users don't get logged out mid-work.
</transcript>
</input>
<output>
{"summary":"Implemented JWT-based authentication replacing session-based auth, with 24-hour token expiry and refresh token flow","current_focus":"Authentication system implementation","next_steps":["Test the refresh token flow with expired tokens","Add token revocation for logout"],"decisions":["Chose JWT over sessions — eliminates Redis dependency since tokens are stateless","Set 24-hour token expiry with refresh flow — balances security with user convenience"],"preferences_expressed":["User directed specific token expiry of 24 hours"]}
</output>
</example>

<example>
<input>
<previous_state>Focus: Investigating test failures</previous_state>
<transcript>
User Asked: The CI is failing on the webhook tests
Assistant Response: Found the issue — the test was using a hardcoded timestamp that expired. Changed it to use a relative timestamp. Also found that the webhook handler had a race condition where two events could arrive simultaneously and both pass the idempotency check. Added a mutex lock.
User Asked: Good catch on the race condition
</transcript>
</input>
<output>
{"summary":"Fixed CI test failure caused by hardcoded timestamp and discovered a race condition in the webhook handler","current_focus":"Webhook test failures and handler reliability","problems_solved":["Fixed expired hardcoded timestamp in webhook tests — replaced with relative timestamp calculation","Fixed race condition in webhook handler where simultaneous events bypassed idempotency check — added mutex lock"],"next_steps":["Verify CI passes with the timestamp and mutex fixes"]}
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
 * Returns defaults suitable for llm-core's complete() function.
 * Service resolution (API keys, endpoints) is handled by llm-core
 * via ~/.config/llm-core/services.toml and apiconf.
 *
 * To configure:
 *   1. Set up apiconf: ~/.config/apiconf/config.toml
 *   2. Set up services: ~/.config/llm-core/services.toml
 *   3. Optionally override model/maxTokens via SummarizeOptions
 */
export function loadConfig(): SummarizeConfig {
  return {
    model: "claude-3-5-haiku-20241022",
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
    const model = options?.model || config.model;

    // Validate model before calling complete() (which throws on empty model)
    if (!model) {
      return {
        error:
          "No model configured. Set model in loadConfig() or pass via options.model",
      };
    }

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
