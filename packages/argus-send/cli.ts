#!/usr/bin/env bun
/**
 * argus-send CLI
 *
 * Philosophy:
 * - Synchronous delivery - Blocks until Argus confirms capture
 * - Config-aware - Reads API key from ~/.config/argus/config.toml
 * - Composable - Accepts data via --data flag or stdin pipe
 *
 * Usage:
 *   argus-send --source <name> --type <event-type> [options]
 *
 * Exit codes:
 *   0 - Event captured successfully
 *   1 - Argus server error (connection failed, rejected event)
 *   2 - Client error (missing args, invalid data, config not found)
 */

import { sendEvent, loadConfig, type ArgusEvent } from "./index";

// ============================================================================
// Stdin Reading
// ============================================================================

/**
 * Read JSON data from stdin
 */
async function readStdin(): Promise<unknown | null> {
  const chunks: Buffer[] = [];

  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  const input = Buffer.concat(chunks).toString("utf-8").trim();
  if (!input) return null;

  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

// ============================================================================
// CLI
// ============================================================================

/**
 * Print usage and exit
 */
function printUsage(): void {
  console.error(`
argus-send - Send events to Argus observability platform

Philosophy:
  Synchronous delivery ensures event captured before continuing.
  Config-aware tool reads API key from Argus config automatically.
  Composable with other llcli tools via JSON piping.

Usage: argus-send --source <name> --type <event-type> [options]

Required:
  --source <name>           Source name (e.g., "llcli-tools", "momentum")
  --type <event-type>       Event type (e.g., "gitignore-check", "task-complete")

Optional:
  --message <text>          Human-readable message
  --level <level>           Level: debug, info, warn, error
  --data <json>             JSON data string
  --stdin                   Read data from stdin (JSON)
  --host <url>              Argus host (default: http://127.0.0.1:8765)
  --api-key <key>           API key (default: from ~/.config/argus/config.toml)
  -h, --help                Show this help

Environment:
  ARGUS_API_KEY             Override config file API key
  ARGUS_HOST                Override default host

Examples:
  # Simple event
  argus-send --source momentum --type task-complete --level info

  # With message and data
  argus-send --source llcli-tools --type gitignore-check \\
    --message "Checked project" \\
    --data '{"missing": 96}'

  # Pipe data from another tool
  gitignore-check . | argus-send --source llcli-tools --type gitignore-check --stdin

  # Compose with jq
  gitignore-check . | jq '{missing: .missing | length}' | argus-send \\
    --source llcli-tools \\
    --type gitignore-check \\
    --stdin
`);
}

interface ParsedArgs {
  source: string;
  eventType: string;
  message?: string;
  level?: "debug" | "info" | "warn" | "error";
  dataStr?: string;
  useStdin: boolean;
  host: string;
  apiKey: string | null;
}

/**
 * Parse command-line arguments
 */
function parseArgs(
  argv: string[],
  config: ReturnType<typeof loadConfig>,
): ParsedArgs | null {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return null;
  }

  let source: string | null = null;
  let eventType: string | null = null;
  let message: string | undefined;
  let level: "debug" | "info" | "warn" | "error" | undefined;
  let dataStr: string | undefined;
  let useStdin = false;
  let host = process.env.ARGUS_HOST || config.host;
  let apiKey: string | null = process.env.ARGUS_API_KEY || config.apiKey;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--source" && i + 1 < args.length) {
      source = args[++i];
    } else if (arg === "--type" && i + 1 < args.length) {
      eventType = args[++i];
    } else if (arg === "--message" && i + 1 < args.length) {
      message = args[++i];
    } else if (arg === "--level" && i + 1 < args.length) {
      level = args[++i] as "debug" | "info" | "warn" | "error";
    } else if (arg === "--data" && i + 1 < args.length) {
      dataStr = args[++i];
    } else if (arg === "--stdin") {
      useStdin = true;
    } else if (arg === "--host" && i + 1 < args.length) {
      host = args[++i];
    } else if (arg === "--api-key" && i + 1 < args.length) {
      apiKey = args[++i];
    }
  }

  if (!source || !eventType) {
    return null;
  }

  return {
    source,
    eventType,
    message,
    level,
    dataStr,
    useStdin,
    host,
    apiKey,
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const parsed = parseArgs(process.argv, config);

  if (!parsed) {
    printUsage();
    process.exit(parsed === null && process.argv.length > 2 ? 2 : 0);
  }

  // Validate API key
  if (!parsed.apiKey) {
    console.log(
      JSON.stringify({
        captured: false,
        error: "API key not found (check ~/.config/argus/config.toml)",
      }),
    );
    console.error("❌ API key not found in config");
    process.exit(2);
  }

  // Build event
  const event: ArgusEvent = {
    source: parsed.source,
    event_type: parsed.eventType,
  };

  if (parsed.message) event.message = parsed.message;
  if (parsed.level) event.level = parsed.level;

  // Parse data from --data flag or stdin
  if (parsed.useStdin) {
    const stdinData = await readStdin();
    if (stdinData) {
      event.data = stdinData;
    }
  } else if (parsed.dataStr) {
    try {
      event.data = JSON.parse(parsed.dataStr);
    } catch {
      console.log(
        JSON.stringify({
          captured: false,
          error: "Invalid JSON in --data argument",
        }),
      );
      console.error("❌ Invalid JSON in --data");
      process.exit(2);
    }
  }

  // Send event
  const result = await sendEvent(event, parsed.apiKey, parsed.host);

  // Output JSON (stdout)
  console.log(JSON.stringify(result));

  // Diagnostic to stderr
  if (result.captured) {
    console.error(`✅ Event captured (ID: ${result.event_id})`);
    process.exit(0);
  } else {
    console.error(`❌ Failed: ${result.error}`);
    process.exit(1);
  }
}

main();
