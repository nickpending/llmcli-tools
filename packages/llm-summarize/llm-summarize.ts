#!/usr/bin/env bun
/**
 * llm-summarize - Summarize text using LLM APIs
 *
 * Philosophy:
 * - Fast summaries for observability and logging
 * - Multi-provider support (Anthropic, OpenAI)
 * - Deterministic JSON output for tooling integration
 * - Config-driven - no hardcoded defaults
 *
 * Usage:
 *   llm-summarize <text>
 *   llm-summarize --stdin
 *   echo "text" | llm-summarize --stdin
 *
 * Config: ~/.config/llm/config.toml
 *   [llm]
 *   provider = "anthropic"
 *   model = "claude-3-5-haiku-latest"
 *   api_key = "env:ANTHROPIC_API_KEY"
 *   max_tokens = 50
 *
 * Secrets: ~/.config/llm/.env
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Exit codes:
 *   0 - Success
 *   1 - API error (rate limit, auth, network)
 *   2 - Client error (missing args, invalid config)
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Types
interface SummarizeResult {
  summary?: string;
  error?: string;
  model?: string;
  tokens_used?: number;
}

interface LLMConfig {
  provider: string | null;
  model: string | null;
  apiKey: string | null;
  apiBase: string | null;
  maxTokens: number;
}

type ProviderType = "anthropic" | "openai" | "ollama";

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
function loadConfig(): LLMConfig {
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

/**
 * Read text from stdin
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8").trim();
}

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
            content: `Summarize this in one concise sentence (max ${maxTokens} tokens):\n\n${text}`,
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
            content: `Summarize this in one concise sentence (max ${maxTokens} tokens):\n\n${text}`,
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
  apiBase?: string,
): Promise<SummarizeResult> {
  const endpoint = apiBase || "http://localhost:11434/api/generate";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: `Summarize this in one concise sentence (max ${maxTokens} tokens):\n\n${text}`,
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

/**
 * Summarize text using configured LLM
 */
async function summarize(
  text: string,
  config: LLMConfig,
  modelOverride?: string,
  maxTokensOverride?: number,
): Promise<SummarizeResult> {
  const provider = config.provider;
  const model = modelOverride || config.model;
  const maxTokens = maxTokensOverride || config.maxTokens;
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
      apiKey,
      config.apiBase || undefined,
    );
  } else if (provider === "openai") {
    return callOpenAI(
      text,
      model,
      maxTokens,
      apiKey,
      config.apiBase || undefined,
    );
  } else if (provider === "ollama") {
    return callOllama(text, model, maxTokens, config.apiBase || undefined);
  } else {
    return {
      error: `Unknown provider: ${provider}. Supported: anthropic, openai, ollama`,
    };
  }
}

/**
 * Print usage
 */
function printUsage(): void {
  console.error(`
llm-summarize - Summarize text using LLM APIs

Philosophy:
  Fast, cheap summaries for observability events.
  Config-driven - specify exact provider/model.
  JSON output for tooling integration.

Usage: llm-summarize [options] <text>
       llm-summarize --stdin

Options:
  --model <name>        Override model from config
  --max-tokens <n>      Max output tokens (default: from config or 50)
  --stdin               Read text from stdin
  -h, --help            Show this help

Config file: ~/.config/llm/config.toml
  [llm]
  provider = "anthropic"
  model = "claude-3-5-haiku-latest"
  api_key = "env:ANTHROPIC_API_KEY"
  max_tokens = 50

Secrets file: ~/.config/llm/.env
  ANTHROPIC_API_KEY=sk-ant-...
  OPENAI_API_KEY=sk-...

Environment overrides:
  LLM_PROVIDER          Override provider
  LLM_MODEL             Override model
  LLM_API_KEY           Override API key

Supported providers:
  anthropic - Claude models (claude-3-5-haiku-latest, claude-sonnet-4-20250514)
  openai    - GPT models (gpt-4.1-mini, gpt-4o)
  ollama    - Local models (llama3, mistral, gemma3, etc.) - no API key needed

Examples:
  # Simple summarization
  llm-summarize "User requested fix for post-password-reset login failure"

  # With options
  llm-summarize --max-tokens 30 "Long event description..."

  # From stdin (for piping)
  echo "Tool: Edit, File: auth.ts, Result: added JWT validation" | llm-summarize --stdin

  # Pipe from another tool
  cat event.json | jq -r '.description' | llm-summarize --stdin
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Load config
  const config = loadConfig();

  // Parse arguments
  let modelOverride: string | undefined;
  let maxTokensOverride: number | undefined;
  let useStdin = false;
  let text = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--model" && i + 1 < args.length) {
      modelOverride = args[++i];
    } else if (arg === "--max-tokens" && i + 1 < args.length) {
      maxTokensOverride = parseInt(args[++i], 10);
    } else if (arg === "--stdin") {
      useStdin = true;
    } else if (!arg.startsWith("-")) {
      text = arg;
    }
  }

  // Get text from stdin or argument
  if (useStdin) {
    text = await readStdin();
  }

  if (!text) {
    console.log(JSON.stringify({ error: "No text provided" }, null, 2));
    console.error("Error: No text to summarize");
    process.exit(2);
  }

  // Summarize
  const result = await summarize(
    text,
    config,
    modelOverride,
    maxTokensOverride,
  );

  // Output JSON
  console.log(JSON.stringify(result, null, 2));

  // Diagnostic
  if (result.summary) {
    console.error(`✅ Summarized (${result.tokens_used || "?"} tokens)`);
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }
}

main();
