#!/usr/bin/env bun
/**
 * llm-summarize CLI
 *
 * Philosophy:
 * - Structured session insight extraction for knowledge systems
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
 *   provider = "ollama"
 *   model = "Qwen2.5:3b"
 *   api_base = "https://ollama.example.com"
 *   max_tokens = 1024
 *
 * Secrets: ~/.config/llm/.env
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Exit codes:
 *   0 - Success
 *   1 - API error (rate limit, auth, network)
 *   2 - Client error (missing args, invalid config)
 */

import {
  summarize,
  loadConfig,
  type SummarizeOptions,
  type SummarizeMode,
} from "./index";

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
llm-summarize - Extract structured insights from session transcripts

Philosophy:
  Structured session insight extraction for knowledge systems.
  Config-driven - specify exact provider/model.
  JSON output for tooling integration.

Usage: llm-summarize [options] <text>
       llm-summarize --stdin

Options:
  --mode <mode>         Summarization mode: quick or insights (default: insights)
  --model <name>        Override model from config
  --max-tokens <n>      Max output tokens (default: from config or 1024)
  --stdin               Read text from stdin
  -h, --help            Show this help

Modes:
  quick     - Fast one-liner summary (for user prompts)
  insights  - Full SessionInsights extraction (for responses)

Config file: ~/.config/llm/config.toml
  [llm]
  provider = "ollama"
  model = "Qwen2.5:3b"
  api_base = "https://ollama.example.com"
  max_tokens = 1024

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
  ollama    - Local models (Qwen2.5:3b, llama3.2:3b, etc.) - no API key needed

Output format:
  {
    "insights": {
      "summary": "One sentence: what was accomplished",
      "decisions": ["Specific decisions with reasoning"],
      "patterns_used": ["Development patterns observed"],
      "preferences_expressed": ["User preferences revealed"],
      "problems_solved": ["Problems addressed and how"],
      "tools_heavy": ["Tools used notably"]
    },
    "model": "qwen2.5:3b",
    "tokens_used": 150
  }

Examples:
  # Extract insights from session transcript
  cat session.txt | llm-summarize --stdin

  # From clipboard
  pbpaste | llm-summarize --stdin
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
  let modeOverride: SummarizeMode | undefined;
  let useStdin = false;
  let text = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--model" && i + 1 < args.length) {
      modelOverride = args[++i];
    } else if (arg === "--max-tokens" && i + 1 < args.length) {
      maxTokensOverride = parseInt(args[++i], 10);
    } else if (arg === "--mode" && i + 1 < args.length) {
      const mode = args[++i];
      if (mode === "quick" || mode === "insights") {
        modeOverride = mode;
      } else {
        console.error(`Invalid mode: ${mode}. Use 'quick' or 'insights'.`);
        process.exit(2);
      }
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
      mode: modeOverride,
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
  if (result.insights) {
    console.error(
      `✅ Extracted insights (${result.tokens_used || "?"} tokens)`,
    );
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }
}

main();
