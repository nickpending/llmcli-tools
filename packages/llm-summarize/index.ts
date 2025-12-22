/**
 * llm-summarize - Library exports
 *
 * Fast LLM-powered text summarization for observability and logging.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { summarize, loadConfig } from "llm-summarize";
 *   const config = loadConfig();
 *   const result = await summarize("text to summarize", config);
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export interface SummarizeResult {
  summary?: string;
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
}

export type ProviderType = "anthropic" | "openai" | "ollama";

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
    maxTokens: 50,
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
        messages: [
          {
            role: "user",
            content: `What was accomplished or decided? One sentence, past tense, focus on actions and outcomes:\n\n${text}`,
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

    return {
      summary: content.trim(),
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
            role: "user",
            content: `What was accomplished or decided? One sentence, past tense, focus on actions and outcomes:\n\n${text}`,
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

    return {
      summary: content.trim(),
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
 * Call Ollama API
 */
async function callOllama(
  text: string,
  model: string,
  maxTokens: number,
  apiBase: string,
): Promise<SummarizeResult> {
  const endpoint = `${apiBase}/api/generate`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: `What was accomplished or decided? One sentence, past tense, focus on actions and outcomes:\n\n${text}`,
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
    const content = result.response || "";

    return {
      summary: content.trim(),
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
 * @param options - Optional overrides for model and maxTokens
 * @returns SummarizeResult with summary or error
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
      config.apiBase || undefined,
    );
  } else if (provider === "openai") {
    return callOpenAI(
      text,
      model,
      maxTokens,
      apiKey!,
      config.apiBase || undefined,
    );
  } else if (provider === "ollama") {
    if (!config.apiBase) {
      return {
        error: `No api_base configured for ollama. Set api_base in ~/.config/llm/config.toml`,
      };
    }
    return callOllama(text, model, maxTokens, config.apiBase);
  } else {
    return {
      error: `Unknown provider: ${provider}. Supported: anthropic, openai, ollama`,
    };
  }
}
