#!/usr/bin/env bun
/**
 * llm-notify CLI
 *
 * Queue notifications for Claude awareness from external systems.
 *
 * Usage:
 *   llm-notify emit --source <name> --tier <tier> --message <text>
 *
 * Exit codes:
 *   0 - Notification queued successfully
 *   2 - Client error (missing args, write failure)
 */

import { emit, type Tier } from "./index";

// ============================================================================
// CLI
// ============================================================================

function printUsage(): void {
  console.error(`
llm-notify - Queue notifications for Claude awareness

Usage: llm-notify <command> [options]

Commands:
  emit      Add a notification to the queue

Emit Options:
  --source <name>         Source name (e.g., "ci", "cron", "monitoring")
  --tier <tier>           Notification tier: urgent, indicator, silent
  --message <text>        Human-readable message
  -h, --help              Show this help

Tiers:
  urgent      Interrupt - show immediately, auto-ack after injection
  indicator   Show when convenient - persists until manually acked
  silent      Log only - never surfaced to Claude

Examples:
  # CI build failure (urgent - Claude sees immediately)
  llm-notify emit --source ci --tier urgent --message "Build failed on main"

  # Daily backup complete (indicator - shown when convenient)
  llm-notify emit --source cron --tier indicator --message "Daily backup completed"

  # Heartbeat (silent - logged but not surfaced)
  llm-notify emit --source monitoring --tier silent --message "Service healthy"
`);
}

interface ParsedEmitArgs {
  source: string;
  tier: Tier;
  message: string;
}

const VALID_TIERS: Tier[] = ["urgent", "indicator", "silent"];

function parseEmitArgs(args: string[]): ParsedEmitArgs | null {
  let source: string | null = null;
  let tier: Tier | null = null;
  let message: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--source" && i + 1 < args.length) {
      source = args[++i];
    } else if (arg === "--tier" && i + 1 < args.length) {
      const tierArg = args[++i];
      if (!VALID_TIERS.includes(tierArg as Tier)) {
        console.error(
          `Invalid tier: ${tierArg}. Must be: urgent, indicator, or silent`,
        );
        return null;
      }
      tier = tierArg as Tier;
    } else if (arg === "--message" && i + 1 < args.length) {
      message = args[++i];
    }
  }

  if (!source || !tier || !message) {
    return null;
  }

  return { source, tier, message };
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  if (command !== "emit") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(2);
  }

  const parsed = parseEmitArgs(args.slice(1));

  if (!parsed) {
    console.error("Missing required arguments: --source, --tier, --message");
    printUsage();
    process.exit(2);
  }

  const result = emit(parsed.source, parsed.tier, parsed.message);

  // Output JSON (stdout)
  console.log(JSON.stringify(result));

  // Diagnostic to stderr
  if (result.success) {
    console.error(`Notification queued (ID: ${result.id})`);
    process.exit(0);
  } else {
    console.error(`Failed: ${result.error}`);
    process.exit(2);
  }
}

main();
