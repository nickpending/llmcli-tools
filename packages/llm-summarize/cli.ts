#!/usr/bin/env bun
/**
 * llm-summarize CLI
 *
 * Philosophy:
 * - Fast summaries for observability and logging
 * - Multi-provider support (Anthropic, OpenAI, Ollama)
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

import { summarize, loadConfig, type SummarizeOptions } from "./index";

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

interface ParsedArgs {
  text: string;
  options: SummarizeOptions;
}

/**
 * Parse command-line arguments
 */
async function parseArgs(argv: string[]): Promise<ParsedArgs | null> {
  const args = argv.slice(2);

  // Handle help
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return null;
  }

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

  return {
    text,
    options: {
      model: modelOverride,
      maxTokens: maxTokensOverride,
    },
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const parsed = await parseArgs(process.argv);

  if (!parsed) {
    printUsage();
    process.exit(0);
  }

  if (!parsed.text) {
    console.log(JSON.stringify({ error: "No text provided" }, null, 2));
    console.error("Error: No text to summarize");
    process.exit(2);
  }

  // Load config and summarize
  const config = loadConfig();
  const result = await summarize(parsed.text, config, parsed.options);

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
