/**
 * Capture Command Handlers
 *
 * Implements three capture subcommands:
 * - task: Task completion with structured synthesis
 * - knowledge: Knowledge insights from CAPTURE format
 * - note: Quick notes with optional tags
 */

import {
  writeEvent,
  TaskEvent,
  KnowledgeEvent,
  NoteEvent,
} from "../lib/events";

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
 * Validate required fields are present
 */
function requireFields(args: Map<string, string>, fields: string[]): void {
  const missing = fields.filter((f) => !args.has(f));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
}

/**
 * Parse comma-separated list into array
 */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Task capture handler
 * Replaces lore_task_complete bash function
 */
export function captureTask(args: string[]): void {
  const parsed = parseArgs(args);

  // Required fields
  requireFields(parsed, ["project", "name", "problem", "solution"]);

  const event: TaskEvent = {
    event: "captured",
    type: "task",
    timestamp: "", // Will be added by writeEvent
    data: {
      project: parsed.get("project")!,
      task_name: parsed.get("name")!,
      problem_solved: parsed.get("problem")!,
      solution_pattern: parsed.get("solution")!,
      code_snippet: parsed.get("code"),
      discoveries: parseList(parsed.get("discoveries")),
      deviations: parsed.get("deviations"),
      reusable_pattern: parsed.get("pattern"),
      keywords: parseList(parsed.get("keywords")),
      tech_used: parseList(parsed.get("tech")),
      difficulty_notes: parsed.get("difficulty"),
    },
  };

  writeEvent(event);
}

/**
 * Knowledge capture handler
 * Handles insights from 📁 CAPTURE format
 */
export function captureKnowledge(args: string[]): void {
  const parsed = parseArgs(args);

  // Required fields
  requireFields(parsed, ["context", "text", "type"]);

  const captureType = parsed.get("type");
  if (captureType !== "project" && captureType !== "conversation") {
    throw new Error(
      `Invalid type: ${captureType}. Must be 'project' or 'conversation'`,
    );
  }

  const event: KnowledgeEvent = {
    event: "captured",
    type: "knowledge",
    timestamp: "", // Will be added by writeEvent
    data: {
      context: parsed.get("context")!,
      capture: parsed.get("text")!,
      type: captureType as "project" | "conversation",
    },
  };

  writeEvent(event);
}

/**
 * Note capture handler
 * Replaces lore_note bash function
 */
export function captureNote(args: string[]): void {
  const parsed = parseArgs(args);

  // Required fields
  requireFields(parsed, ["text"]);

  const event: NoteEvent = {
    event: "captured",
    type: "note",
    timestamp: "", // Will be added by writeEvent
    data: {
      content: parsed.get("text")!,
      tags: parseList(parsed.get("tags")),
      context: parsed.get("context"),
    },
  };

  writeEvent(event);
}
