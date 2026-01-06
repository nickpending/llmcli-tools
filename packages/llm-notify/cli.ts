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

import { emit, list, type Tier, type Notification } from "./index";

// ============================================================================
// CLI
// ============================================================================

function printUsage(): void {
  console.error(`
llm-notify - Queue notifications for Claude awareness

Usage: llm-notify <command> [options]

Commands:
  emit      Add a notification to the queue
  list      Show notifications in the queue

Emit Options:
  --source <name>         Source name (e.g., "ci", "cron", "monitoring")
  --tier <tier>           Notification tier: urgent, indicator, silent
  --message <text>        Human-readable message
  -h, --help              Show this help

List Options:
  --unacked               Show only unacked notifications
  --json                  Output as JSON array (default: human-readable)

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

  # List unacked notifications
  llm-notify list --unacked
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

interface ParsedListArgs {
  unacked: boolean;
  json: boolean;
}

function parseListArgs(args: string[]): ParsedListArgs {
  return {
    unacked: args.includes("--unacked"),
    json: args.includes("--json"),
  };
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNotification(n: Notification): string {
  const ackedMark = n.acked ? " [acked]" : "";
  return `[${n.tier}] ${n.source}: ${n.message} (${formatTimestamp(n.timestamp)})${ackedMark}`;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  if (command === "emit") {
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
  } else if (command === "list") {
    const parsed = parseListArgs(args.slice(1));
    const notifications = list(parsed.unacked);

    if (parsed.json) {
      // JSON output to stdout
      console.log(JSON.stringify(notifications));
    } else {
      // Human-readable output
      if (notifications.length === 0) {
        console.log("No notifications");
      } else {
        for (const n of notifications) {
          console.log(formatNotification(n));
        }
      }
    }
    console.error(`${notifications.length} notification(s)`);
    process.exit(0);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(2);
  }
}

main();
