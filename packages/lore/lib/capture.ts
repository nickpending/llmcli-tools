/**
 * lib/capture.ts - Knowledge capture functions
 *
 * Pure functions for capturing tasks, insights, and notes.
 * Writes to ~/.local/share/lore/log.jsonl
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface CaptureResult {
  success: boolean;
  error?: string;
}

export type KnowledgeCaptureType =
  | "project"
  | "conversation"
  | "decision"
  | "learning"
  | "gotcha"
  | "preference"
  | "knowledge";

export interface KnowledgeInput {
  context: string;
  text: string;
  type: KnowledgeCaptureType;
}

export interface TaskInput {
  project: string;
  name: string;
  problem: string;
  solution: string;
  code?: string;
  discoveries?: string[];
  deviations?: string;
  pattern?: string;
  keywords?: string[];
  tech?: string[];
  difficulty?: string;
}

export interface NoteInput {
  text: string;
  tags?: string[];
  context?: string;
}

interface TaskEvent {
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

interface KnowledgeEvent {
  event: "captured";
  type: "knowledge";
  timestamp: string;
  data: {
    context: string;
    capture: string;
    type: KnowledgeCaptureType;
  };
}

interface NoteEvent {
  event: "captured";
  type: "note";
  timestamp: string;
  data: {
    content: string;
    tags?: string[];
    context?: string;
  };
}

type CaptureEvent = TaskEvent | KnowledgeEvent | NoteEvent;

function getLogPath(): string {
  const dataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(dataHome, "lore", "log.jsonl");
}

function ensureLogDirectory(): void {
  const logPath = getLogPath();
  const logDir = join(logPath, "..");

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function writeEvent(event: CaptureEvent): CaptureResult {
  ensureLogDirectory();

  const logPath = getLogPath();
  const eventWithTimestamp = { ...event, timestamp: getTimestamp() };
  const jsonLine = JSON.stringify(eventWithTimestamp) + "\n";

  try {
    appendFileSync(logPath, jsonLine, "utf8");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to write event to ${logPath}: ${error}`,
    };
  }
}

const VALID_KNOWLEDGE_TYPES: KnowledgeCaptureType[] = [
  "project",
  "conversation",
  "decision",
  "learning",
  "gotcha",
  "preference",
  "knowledge",
];

/**
 * Capture a knowledge insight
 */
export function captureKnowledge(input: KnowledgeInput): CaptureResult {
  if (!VALID_KNOWLEDGE_TYPES.includes(input.type)) {
    return {
      success: false,
      error: `Invalid type: ${input.type}. Must be one of: ${VALID_KNOWLEDGE_TYPES.join(", ")}`,
    };
  }

  const event: KnowledgeEvent = {
    event: "captured",
    type: "knowledge",
    timestamp: "",
    data: {
      context: input.context,
      capture: input.text,
      type: input.type,
    },
  };

  return writeEvent(event);
}

/**
 * Capture a task completion
 */
export function captureTask(input: TaskInput): CaptureResult {
  const event: TaskEvent = {
    event: "captured",
    type: "task",
    timestamp: "",
    data: {
      project: input.project,
      task_name: input.name,
      problem_solved: input.problem,
      solution_pattern: input.solution,
      code_snippet: input.code,
      discoveries: input.discoveries,
      deviations: input.deviations,
      reusable_pattern: input.pattern,
      keywords: input.keywords,
      tech_used: input.tech,
      difficulty_notes: input.difficulty,
    },
  };

  return writeEvent(event);
}

/**
 * Capture a quick note
 */
export function captureNote(input: NoteInput): CaptureResult {
  const event: NoteEvent = {
    event: "captured",
    type: "note",
    timestamp: "",
    data: {
      content: input.text,
      tags: input.tags,
      context: input.context,
    },
  };

  return writeEvent(event);
}

export type { CaptureEvent };
