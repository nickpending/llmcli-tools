#!/usr/bin/env bun
/**
 * lore-capture - Knowledge capture CLI
 *
 * Type-safe event logging for tasks, knowledge insights, and notes.
 * Replaces bash capture function sprawl with unified TypeScript interface.
 *
 * Philosophy:
 * - Type-safe - Model-friendly error messages with field validation
 * - Unified - Single capture mechanism for all event types
 * - Composable - JSON output pipes to jq, grep, etc.
 * - Simple - Manual arg parsing, zero framework dependencies
 *
 * Usage:
 *   lore-capture task --project <name> --name <task> --problem <desc> --solution <desc>
 *   lore-capture knowledge --context <name> --text <insight> --type <project|conversation>
 *   lore-capture note --text <content> [--tags <tag1,tag2>] [--context <name>]
 *
 * Examples:
 *   lore-capture task --project=lore --name="Build CLI" --problem="Bash sprawl" --solution="TypeScript"
 *   lore-capture knowledge --context=lore --text="Unified capture eliminates sprawl" --type=project
 *   lore-capture note --text="Remember to test edge cases" --tags=testing,reminder
 *
 * Exit codes:
 *   0 - Success (event logged)
 *   1 - Error (validation failed, missing args)
 *   2 - Error (file write failure)
 */

import { captureTask, captureKnowledge, captureNote } from "./commands/capture";

function showHelp(): void {
  console.error(`
lore-capture - Knowledge capture CLI

Philosophy:
  Type-safe event logging replacing bash function sprawl.
  Single interface for tasks, insights, and notes.
  All events flow to ~/.local/share/lore/log.jsonl

Usage:
  lore-capture task --project <name> --name <task> --problem <desc> --solution <desc> [options]
  lore-capture knowledge --context <name> --text <insight> --type <project|conversation>
  lore-capture note --text <content> [--tags <tag1,tag2>] [--context <name>]

Examples:
  # Task completion with synthesis
  lore-capture task --project=lore --name="Build CLI" --problem="Bash sprawl" --solution="TypeScript CLI"

  # Knowledge insight from work session
  lore-capture knowledge --context=lore --text="Unified capture eliminates function sprawl" --type=project

  # Quick note with tags
  lore-capture note --text="Test edge cases for arg parsing" --tags=testing,reminder

Exit codes:
  0 - Success (event logged)
  1 - Validation error (missing required fields)
  2 - System error (file write failure)
`);
  process.exit(0);
}

function showError(message: string, code: number = 1): never {
  console.log(JSON.stringify({ success: false, error: message }));
  console.error(`❌ ${message}`);
  process.exit(code);
}

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  showHelp();
}

const subcommand = args[0];

if (!subcommand) {
  showError("Missing subcommand. Use: task, knowledge, or note");
}

// Route to appropriate handler
try {
  switch (subcommand) {
    case "task":
      captureTask(args.slice(1));
      break;
    case "knowledge":
      captureKnowledge(args.slice(1));
      break;
    case "note":
      captureNote(args.slice(1));
      break;
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      showError(
        `Unknown subcommand: ${subcommand}. Use: task, knowledge, or note`,
      );
  }
} catch (error) {
  if (error instanceof Error) {
    showError(error.message, 2);
  } else {
    showError("Unknown error occurred", 2);
  }
}
