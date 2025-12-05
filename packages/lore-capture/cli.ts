#!/usr/bin/env bun
/**
 * lore-capture CLI
 *
 * Philosophy:
 * - Type-safe event logging replacing bash function sprawl
 * - Single interface for tasks, insights, and notes
 * - All events flow to ~/.local/share/lore/log.jsonl
 *
 * Usage:
 *   lore-capture task --project <name> --name <task> --problem <desc> --solution <desc>
 *   lore-capture knowledge --context <name> --text <insight> --type <type>
 *   lore-capture note --text <content> [--tags <tag1,tag2>] [--context <name>]
 *
 * Exit codes:
 *   0 - Success (event logged)
 *   1 - Error (validation failed, missing args)
 *   2 - Error (file write failure)
 */

import {
  captureTask,
  captureKnowledge,
  captureNote,
  type KnowledgeInput,
  type TaskInput,
  type NoteInput,
  type KnowledgeCaptureType,
} from "./index";

// ============================================================================
// Argument Parsing
// ============================================================================

/**
 * Parse command-line arguments into key-value map
 * Supports: --key=value and --key value formats
 */
function parseArgs(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      // Handle --key=value format
      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        parsed.set(k, v);
        i++;
      }
      // Handle --key value format
      else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed.set(key, args[i + 1]);
        i += 2;
      }
      // Handle flag with no value
      else {
        parsed.set(key, "true");
        i++;
      }
    } else {
      i++;
    }
  }

  return parsed;
}

/**
 * Parse comma-separated list into array
 */
function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Check required fields and return error message if missing
 */
function checkRequired(
  args: Map<string, string>,
  fields: string[],
): string | null {
  const missing = fields.filter((f) => !args.has(f));
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

// ============================================================================
// CLI Handlers
// ============================================================================

function handleTask(args: string[]): void {
  const parsed = parseArgs(args);

  const missingError = checkRequired(parsed, [
    "project",
    "name",
    "problem",
    "solution",
  ]);
  if (missingError) {
    console.log(JSON.stringify({ success: false, error: missingError }));
    console.error(`❌ ${missingError}`);
    process.exit(1);
  }

  const input: TaskInput = {
    project: parsed.get("project")!,
    name: parsed.get("name")!,
    problem: parsed.get("problem")!,
    solution: parsed.get("solution")!,
    code: parsed.get("code"),
    discoveries: parseList(parsed.get("discoveries")),
    deviations: parsed.get("deviations"),
    pattern: parsed.get("pattern"),
    keywords: parseList(parsed.get("keywords")),
    tech: parseList(parsed.get("tech")),
    difficulty: parsed.get("difficulty"),
  };

  const result = captureTask(input);
  console.log(JSON.stringify(result));

  if (result.success) {
    console.error("✅ Task logged");
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

function handleKnowledge(args: string[]): void {
  const parsed = parseArgs(args);

  const missingError = checkRequired(parsed, ["context", "text", "type"]);
  if (missingError) {
    console.log(JSON.stringify({ success: false, error: missingError }));
    console.error(`❌ ${missingError}`);
    process.exit(1);
  }

  const input: KnowledgeInput = {
    context: parsed.get("context")!,
    text: parsed.get("text")!,
    type: parsed.get("type")! as KnowledgeCaptureType,
  };

  const result = captureKnowledge(input);
  console.log(JSON.stringify(result));

  if (result.success) {
    console.error("✅ Knowledge logged");
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }
}

function handleNote(args: string[]): void {
  const parsed = parseArgs(args);

  const missingError = checkRequired(parsed, ["text"]);
  if (missingError) {
    console.log(JSON.stringify({ success: false, error: missingError }));
    console.error(`❌ ${missingError}`);
    process.exit(1);
  }

  const input: NoteInput = {
    text: parsed.get("text")!,
    tags: parseList(parsed.get("tags")),
    context: parsed.get("context"),
  };

  const result = captureNote(input);
  console.log(JSON.stringify(result));

  if (result.success) {
    console.error("✅ Note logged");
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

// ============================================================================
// Help & Main
// ============================================================================

function showHelp(): void {
  console.error(`
lore-capture - Knowledge capture CLI

Philosophy:
  Type-safe event logging replacing bash function sprawl.
  Single interface for tasks, insights, and notes.
  All events flow to ~/.local/share/lore/log.jsonl

Usage:
  lore-capture task --project <name> --name <task> --problem <desc> --solution <desc> [options]
  lore-capture knowledge --context <name> --text <insight> --type <type>
  lore-capture note --text <content> [--tags <tag1,tag2>] [--context <name>]

Knowledge types:
  project, conversation, decision, learning, gotcha, preference, knowledge

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

function showError(message: string): never {
  console.log(JSON.stringify({ success: false, error: message }));
  console.error(`❌ ${message}`);
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
  }

  const subcommand = args[0];

  switch (subcommand) {
    case "task":
      handleTask(args.slice(1));
      break;
    case "knowledge":
      handleKnowledge(args.slice(1));
      break;
    case "note":
      handleNote(args.slice(1));
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
}

main();
