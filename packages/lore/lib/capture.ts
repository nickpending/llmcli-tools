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
  [key: string]: unknown;
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

export interface TeachingInput {
  domain: string;
  confidence: string;
  text: string;
  source?: string;
}

export type InsightType =
  | "decision"
  | "pattern"
  | "preference"
  | "problem"
  | "tool"
  | "summary";

export interface InsightInput {
  session_id: string;
  project: string;
  insight_type: InsightType;
  text: string;
  source: "auto";
}

export interface LearningInput {
  topic: string; // "spanish", "guitar", "kubernetes"
  persona: string; // "marcus", "elena", etc.
  progress: string; // "Covered verb conjugations, struggles with subjunctive"
  goal?: string; // "conversational in 3 months"
  session_summary?: string; // Longer form session notes
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

interface TeachingEvent {
  event: "captured";
  type: "teaching";
  timestamp: string;
  data: {
    domain: string;
    confidence: string;
    text: string;
    source: string;
  };
}

interface InsightEvent {
  event: "captured";
  type: "insight";
  timestamp: string;
  data: {
    session_id: string;
    project: string;
    insight_type: InsightType;
    text: string;
    source: "auto";
  };
}

interface LearningEvent {
  event: "captured";
  type: "learning";
  timestamp: string;
  data: {
    topic: string;
    persona: string;
    progress: string;
    goal?: string;
    session_summary?: string;
  };
}

type CaptureEvent =
  | TaskEvent
  | KnowledgeEvent
  | NoteEvent
  | TeachingEvent
  | InsightEvent
  | LearningEvent;

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

/**
 * Capture a teaching moment
 */
export function captureTeaching(input: TeachingInput): CaptureResult {
  const event: TeachingEvent = {
    event: "captured",
    type: "teaching",
    timestamp: "",
    data: {
      domain: input.domain,
      confidence: input.confidence,
      text: input.text,
      source: input.source || "manual",
    },
  };

  return writeEvent(event);
}

const VALID_INSIGHT_TYPES: InsightType[] = [
  "decision",
  "pattern",
  "preference",
  "problem",
  "tool",
  "summary",
];

/**
 * Capture an auto-extracted insight from llm-summarize
 */
export function captureInsight(input: InsightInput): CaptureResult {
  if (!VALID_INSIGHT_TYPES.includes(input.insight_type)) {
    return {
      success: false,
      error: `Invalid insight_type: ${input.insight_type}. Must be one of: ${VALID_INSIGHT_TYPES.join(", ")}`,
    };
  }

  const event: InsightEvent = {
    event: "captured",
    type: "insight",
    timestamp: "",
    data: {
      session_id: input.session_id,
      project: input.project,
      insight_type: input.insight_type,
      text: input.text,
      source: input.source,
    },
  };

  return writeEvent(event);
}

/**
 * Capture a learning session progress
 */
export function captureLearning(input: LearningInput): CaptureResult {
  if (!input.topic || !input.persona || !input.progress) {
    return {
      success: false,
      error: "Missing required fields: topic, persona, progress",
    };
  }

  const event: LearningEvent = {
    event: "captured",
    type: "learning",
    timestamp: "",
    data: {
      topic: input.topic,
      persona: input.persona,
      progress: input.progress,
      goal: input.goal,
      session_summary: input.session_summary,
    },
  };

  return writeEvent(event);
}

export type { CaptureEvent };
