#!/usr/bin/env bun
/**
 * argus-send - Send events to Argus observability platform
 *
 * Philosophy:
 * - Synchronous delivery - Blocks until Argus confirms capture
 * - Zero dependencies - Uses Bun's native fetch
 * - Config-aware - Reads API key from ~/.config/argus/config.toml
 * - Composable - Accepts data via --data flag or stdin pipe
 *
 * Usage:
 *   argus-send --source <name> --type <event-type> [options]
 *
 * Examples:
 *   argus-send --source llcli-tools --type gitignore-check --message "Checked project"
 *   argus-send --source momentum --type task-complete --level info
 *   echo '{"missing": 96}' | argus-send --source llcli-tools --type gitignore-check --stdin
 *   gitignore-check . | argus-send --source llcli-tools --type gitignore-check --stdin
 *
 * Exit codes:
 *   0 - Event captured successfully
 *   1 - Argus server error (connection failed, rejected event)
 *   2 - Client error (missing args, invalid data, config not found)
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface ArgusEvent {
  source: string;
  event_type: string;
  message?: string;
  level?: "debug" | "info" | "warn" | "error";
  timestamp?: string;
  data?: unknown;
}

interface SendResult {
  captured: boolean;
  event_id?: number;
  error?: string;
}

/**
 * Read API key from Argus config file
 */
function loadApiKey(): string | null {
  const configPath = join(process.env.HOME!, ".config", "argus", "config.toml");

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");

    // Parse api_keys line: api_keys = ["key1", "key2"]
    const match = content.match(/api_keys\s*=\s*\[([^\]]+)\]/);
    if (!match) return null;

    // Extract first key from array
    const keysStr = match[1];
    const firstKey = keysStr.match(/"([^"]+)"/);
    return firstKey ? firstKey[1] : null;
  } catch {
    return null;
  }
}

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

/**
 * Send event to Argus
 */
async function sendEvent(
  event: ArgusEvent,
  apiKey: string,
  host: string = "http://127.0.0.1:8765",
): Promise<SendResult> {
  try {
    // Add timestamp if missing
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }

    const response = await fetch(`${host}/events`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        captured: false,
        error: `HTTP ${response.status}: ${text}`,
      };
    }

    const result = await response.json();
    return {
      captured: true,
      event_id: result.event_id,
    };
  } catch (error) {
    return {
      captured: false,
      error: `Connection failed: ${String(error)}`,
    };
  }
}

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

  // Parse arguments
  let source: string | null = null;
  let eventType: string | null = null;
  let message: string | null = null;
  let level: "debug" | "info" | "warn" | "error" | null = null;
  let dataStr: string | null = null;
  let useStdin = false;
  let host = process.env.ARGUS_HOST || "http://127.0.0.1:8765";
  let apiKey: string | null = process.env.ARGUS_API_KEY || null;

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

  // Validate required args
  if (!source || !eventType) {
    console.error("Error: --source and --type are required");
    printUsage();
    process.exit(2);
  }

  // Load API key if not provided
  if (!apiKey) {
    apiKey = loadApiKey();
    if (!apiKey) {
      console.log(
        JSON.stringify(
          {
            captured: false,
            error: "API key not found (check ~/.config/argus/config.toml)",
          },
          null,
          2,
        ),
      );
      console.error("❌ API key not found in config");
      process.exit(2);
    }
  }

  // Build event
  const event: ArgusEvent = {
    source,
    event_type: eventType,
  };

  if (message) event.message = message;
  if (level) event.level = level;

  // Parse data from --data flag or stdin
  if (useStdin) {
    const stdinData = await readStdin();
    if (stdinData) {
      event.data = stdinData;
    }
  } else if (dataStr) {
    try {
      event.data = JSON.parse(dataStr);
    } catch {
      console.log(
        JSON.stringify(
          {
            captured: false,
            error: "Invalid JSON in --data argument",
          },
          null,
          2,
        ),
      );
      console.error("❌ Invalid JSON in --data");
      process.exit(2);
    }
  }

  // Send event
  const result = await sendEvent(event, apiKey, host);

  // Output JSON (stdout)
  console.log(JSON.stringify(result, null, 2));

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
