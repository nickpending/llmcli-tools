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

import {
  sendEvent,
  loadConfig,
  type ArgusEvent,
  type ArgusHook,
  type ArgusStatus,
} from "./index";

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
  --type <event-type>       Event type: tool, session, agent, response, prompt

Optional:
  --message <text>          Human-readable message
  --hook <hook>             Hook name: PreToolUse, PostToolUse, Stop, SessionStart,
                            SessionEnd, SubagentStart, SubagentStop, UserPromptSubmit
  --session-id <id>         Claude Code session identifier
  --tool-name <name>        Tool name (Bash, Read, Edit, Task, etc.)
  --tool-use-id <id>        Correlates PreToolUse/PostToolUse pairs
  --status <status>         Event outcome: success, failure, pending
  --data <json>             JSON data string
  --stdin                   Read data from stdin (JSON)
  --host <url>              Argus host (default: http://127.0.0.1:8765)
  --api-key <key>           API key (default: from ~/.config/argus/config.toml)
  -h, --help                Show this help

Environment:
  ARGUS_API_KEY             Override config file API key
  ARGUS_HOST                Override default host

Examples:
  # Tool event
  argus-send --source momentum --type tool \\
    --hook PreToolUse \\
    --session-id "f10e9765-1999-456f-81c3-eb4c531ecee2" \\
    --tool-name Bash \\
    --tool-use-id "toolu_01ABC" \\
    --message "Bash: git status"

  # Session event
  argus-send --source momentum --type session \\
    --hook SessionStart \\
    --session-id "f10e9765-1999-456f-81c3-eb4c531ecee2" \\
    --message "Session started: argus (active)"

  # Pipe data from another tool
  gitignore-check . | argus-send --source llcli-tools --type tool --stdin
`);
}

interface ParsedArgs {
  source: string;
  eventType: string;
  message?: string;
  hook?: ArgusHook;
  sessionId?: string;
  toolName?: string;
  toolUseId?: string;
  status?: ArgusStatus;
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

  // Check for deprecated --level flag
  if (args.includes("--level")) {
    console.error(
      "❌ --level flag is deprecated and rejected by Argus API. Remove it from your command.",
    );
    process.exit(2);
  }

  let source: string | null = null;
  let eventType: string | null = null;
  let message: string | undefined;
  let hook: ArgusHook | undefined;
  let sessionId: string | undefined;
  let toolName: string | undefined;
  let toolUseId: string | undefined;
  let status: ArgusStatus | undefined;
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
    } else if (arg === "--hook" && i + 1 < args.length) {
      hook = args[++i] as ArgusHook;
    } else if (arg === "--session-id" && i + 1 < args.length) {
      sessionId = args[++i];
    } else if (arg === "--tool-name" && i + 1 < args.length) {
      toolName = args[++i];
    } else if (arg === "--tool-use-id" && i + 1 < args.length) {
      toolUseId = args[++i];
    } else if (arg === "--status" && i + 1 < args.length) {
      status = args[++i] as ArgusStatus;
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
    hook,
    sessionId,
    toolName,
    toolUseId,
    status,
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
  if (parsed.hook) event.hook = parsed.hook;
  if (parsed.sessionId) event.session_id = parsed.sessionId;
  if (parsed.toolName) event.tool_name = parsed.toolName;
  if (parsed.toolUseId) event.tool_use_id = parsed.toolUseId;
  if (parsed.status) event.status = parsed.status;

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
