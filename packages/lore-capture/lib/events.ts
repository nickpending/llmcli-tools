/**
 * Event Writing Library
 *
 * Handles writing events to ~/.local/share/lore/log.jsonl
 * All capture mechanisms write to same append-only log
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Event type discriminated union
export type CaptureEvent = TaskEvent | KnowledgeEvent | NoteEvent;

export interface TaskEvent {
  event: "captured";
  type: "task";
  timestamp: string;
  data: {
    project: string;
    task_name: string;
    problem_solved: string;
    solution_pattern: string;
    code_snippet?: string;
    discoveries?: string[];
    deviations?: string;
    reusable_pattern?: string;
    keywords?: string[];
    tech_used?: string[];
    difficulty_notes?: string;
  };
}

// Knowledge capture types - used by CAPTURE format
export type KnowledgeCaptureType =
  | "project"
  | "conversation"
  | "decision"
  | "learning"
  | "gotcha"
  | "preference"
  | "knowledge";

export interface KnowledgeEvent {
  event: "captured";
  type: "knowledge";
  timestamp: string;
  data: {
    context: string;
    capture: string;
    type: KnowledgeCaptureType;
  };
}

export interface NoteEvent {
  event: "captured";
  type: "note";
  timestamp: string;
  data: {
    content: string;
    tags?: string[];
    context?: string;
  };
}

/**
 * Get lore log path
 * ~/.local/share/lore/log.jsonl (XDG-compliant)
 */
function getLogPath(): string {
  const dataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(dataHome, "lore", "log.jsonl");
}

/**
 * Ensure log directory exists
 */
function ensureLogDirectory(): void {
  const logPath = getLogPath();
  const logDir = join(logPath, "..");

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Get current timestamp in ISO 8601 UTC format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Write event to log
 * Appends JSONL line to ~/.local/share/lore/log.jsonl
 */
export function writeEvent(event: CaptureEvent): void {
  ensureLogDirectory();

  const logPath = getLogPath();
  const eventWithTimestamp = { ...event, timestamp: getTimestamp() };
  const jsonLine = JSON.stringify(eventWithTimestamp) + "\n";

  try {
    appendFileSync(logPath, jsonLine, "utf8");
    console.log(JSON.stringify({ success: true }));
    console.error("✅ Event logged");
  } catch (error) {
    throw new Error(`Failed to write event to ${logPath}: ${error}`);
  }
}
