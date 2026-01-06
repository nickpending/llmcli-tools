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

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export interface SessionInsights {
  summary: string;
  decisions?: string[];
  patterns_used?: string[];
  preferences_expressed?: string[];
  problems_solved?: string[];
  tools_heavy?: string[];
}

export interface SummarizeResult {
  insights?: SessionInsights;
  error?: string;
  model?: string;
  tokens_used?: number;
}

export interface LLMConfig {
  provider: string | null;
  model: string | null;
  apiKey: string | null;
  apiBase: string | null;
  maxTokens: number;
}

export interface SummarizeOptions {
  model?: string;
  maxTokens?: number;
  mode?: "quick" | "insights";
  /** User name to include in summary (e.g., "Rudy") */
  userName?: string;
}

export type ProviderType = "anthropic" | "openai" | "ollama";
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
 * Build insights mode prompt with optional user name
 */
function buildInsightsPrompt(userName?: string): string {
  const nameInstruction = userName
    ? `Start the summary with "${userName}".`
    : "";

  return `You are an experienced engineering manager reviewing session transcripts to extract actionable insights.

Analyze the development session and extract structured observations.

<output_schema>
{
  "summary": "One sentence: what was accomplished or decided",
  "decisions": ["Specific decision and its reasoning"],
  "patterns_used": ["Development pattern or approach observed"],
  "preferences_expressed": ["Preference revealed through actions - DO NOT include user name"],
  "problems_solved": ["Problem addressed and how - DO NOT include user name"],
  "tools_heavy": ["Tool used repeatedly or notably"]
}
</output_schema>

<rules>
- ${nameInstruction || "Write summary in third person."}
- Include a field ONLY when the conversation provides clear evidence
- Extract specifics: "Chose SQLite over Postgres for single-user simplicity" not "Made a database decision"
- Omit empty arrays entirely
- IMPORTANT: Only use user name in the summary field, nowhere else
</rules>

Output valid JSON only. No markdown code blocks, no explanation.`;
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
 * Load environment variables from .env file
 */
function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};

  if (!existsSync(envPath)) {
    return env;
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  } catch {
    // Ignore parse errors
  }

  return env;
}

/**
 * Resolve env: references in config values
 */
function resolveEnvRef(
  value: string,
  envVars: Record<string, string>,
): string | null {
  if (value.startsWith("env:")) {
    const varName = value.slice(4);
    return envVars[varName] || process.env[varName] || null;
  }
  return value;
}

/**
 * Load configuration from config.toml with env file support
 * Config: ~/.config/llm/config.toml
 * Secrets: ~/.config/llm/.env
 */
export function loadConfig(): LLMConfig {
  const configDir = join(process.env.HOME!, ".config", "llm");
  const configPath = join(configDir, "config.toml");
  const envPath = join(configDir, ".env");

  // Load .env file first
  const envVars = loadEnvFile(envPath);

  // No defaults - config required
  const config: LLMConfig = {
    provider: null,
    model: null,
    apiKey: null,
    apiBase: null,
    maxTokens: 1024,
  };

  if (!existsSync(configPath)) {
    return config;
  }

  try {
    const content = readFileSync(configPath, "utf-8");

    // Parse [llm] section
    const providerMatch = content.match(/^\s*provider\s*=\s*"([^"]+)"/m);
    if (providerMatch) {
      config.provider = providerMatch[1];
    }

    const modelMatch = content.match(/^\s*model\s*=\s*"([^"]+)"/m);
    if (modelMatch) {
      config.model = modelMatch[1];
    }

    const apiKeyMatch = content.match(/^\s*api_key\s*=\s*"([^"]+)"/m);
    if (apiKeyMatch) {
      config.apiKey = resolveEnvRef(apiKeyMatch[1], envVars);
    }

    const apiBaseMatch = content.match(/^\s*api_base\s*=\s*"([^"]+)"/m);
    if (apiBaseMatch) {
      config.apiBase = apiBaseMatch[1];
    }

    const maxTokensMatch = content.match(/^\s*max_tokens\s*=\s*(\d+)/m);
    if (maxTokensMatch) {
      config.maxTokens = parseInt(maxTokensMatch[1], 10);
    }
  } catch {
    // Ignore parse errors
  }

  // Environment variables override config
  if (process.env.LLM_PROVIDER) config.provider = process.env.LLM_PROVIDER;
  if (process.env.LLM_MODEL) config.model = process.env.LLM_MODEL;
  if (process.env.LLM_API_KEY) config.apiKey = process.env.LLM_API_KEY;

  return config;
}

// ============================================================================
// Provider Implementations
// ============================================================================

/**
 * Call Anthropic API
 */
async function callAnthropic(
  text: string,
  model: string,
  maxTokens: number,
  apiKey: string,
  systemPrompt: string,
  apiBase?: string,
): Promise<SummarizeResult> {
  const endpoint = apiBase || "https://api.anthropic.com/v1/messages";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `Anthropic API error: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "";
    const insights = extractJson(content);

    if (!insights) {
      return {
        error: `Failed to parse response as JSON: ${content.slice(0, 200)}`,
      };
    }

    return {
      insights,
      model,
      tokens_used: result.usage?.output_tokens,
    };
  } catch (error) {
    return {
      error: `Anthropic request failed: ${String(error)}`,
    };
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  text: string,
  model: string,
  maxTokens: number,
  apiKey: string,
  systemPrompt: string,
  apiBase?: string,
): Promise<SummarizeResult> {
  const endpoint = apiBase || "https://api.openai.com/v1/chat/completions";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `OpenAI API error: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    const insights = extractJson(content);

    if (!insights) {
      return {
        error: `Failed to parse response as JSON: ${content.slice(0, 200)}`,
      };
    }

    return {
      insights,
      model,
      tokens_used: result.usage?.completion_tokens,
    };
  } catch (error) {
    return {
      error: `OpenAI request failed: ${String(error)}`,
    };
  }
}

/**
 * Call Ollama API (chat endpoint for system prompt support)
 */
async function callOllama(
  text: string,
  model: string,
  maxTokens: number,
  apiBase: string,
  systemPrompt: string,
): Promise<SummarizeResult> {
  const endpoint = `${apiBase}/api/chat`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: text,
          },
        ],
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `Ollama API error: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();
    const content = result.message?.content || "";
    const insights = extractJson(content);

    if (!insights) {
      return {
        error: `Failed to parse response as JSON: ${content.slice(0, 200)}`,
      };
    }

    return {
      insights,
      model,
      tokens_used: result.eval_count,
    };
  } catch (error) {
    return {
      error: `Ollama request failed: ${String(error)}`,
    };
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Summarize text using configured LLM
 *
 * @param text - Text to summarize
 * @param config - LLM configuration (from loadConfig())
 * @param options - Optional overrides for model, maxTokens, and mode
 * @returns SummarizeResult with insights or error
 *
 * Modes:
 * - "quick": Fast one-liner summary (for user prompts)
 * - "insights": Full SessionInsights extraction (for responses, default)
 */
export async function summarize(
  text: string,
  config: LLMConfig,
  options?: SummarizeOptions,
): Promise<SummarizeResult> {
  const provider = config.provider;
  const model = options?.model || config.model;
  const maxTokens = options?.maxTokens || config.maxTokens;
  const apiKey = config.apiKey;
  const mode: SummarizeMode = options?.mode || "insights";
  const userName = options?.userName;
  const systemPrompt = getPromptForMode(mode, userName);

  // Validate config
  if (!provider) {
    return {
      error: `No provider configured. Set provider in ~/.config/llm/config.toml`,
    };
  }

  if (!model) {
    return {
      error: `No model configured. Set model in ~/.config/llm/config.toml`,
    };
  }

  // API key required for cloud providers
  if (!apiKey && provider !== "ollama") {
    return {
      error: `No API key configured. Set api_key = "env:VAR_NAME" in ~/.config/llm/config.toml`,
    };
  }

  // Call appropriate provider
  if (provider === "anthropic") {
    return callAnthropic(
      text,
      model,
      maxTokens,
      apiKey!,
      systemPrompt,
      config.apiBase || undefined,
    );
  } else if (provider === "openai") {
    return callOpenAI(
      text,
      model,
      maxTokens,
      apiKey!,
      systemPrompt,
      config.apiBase || undefined,
    );
  } else if (provider === "ollama") {
    if (!config.apiBase) {
      return {
        error: `No api_base configured for ollama. Set api_base in ~/.config/llm/config.toml`,
      };
    }
    return callOllama(text, model, maxTokens, config.apiBase, systemPrompt);
  } else {
    return {
      error: `Unknown provider: ${provider}. Supported: anthropic, openai, ollama`,
    };
  }
}
