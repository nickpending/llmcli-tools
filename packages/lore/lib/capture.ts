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
  event?: CaptureEvent;
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
  topic: string;
  content: string;
  subtype: KnowledgeCaptureType;
}

export interface TaskInput {
  topic: string;
  name: string;
  problem: string;
  solution: string;
  code?: string;
  discoveries?: string[];
  deviations?: string;
  pattern?: string;
  tags?: string[];
  tech?: string[];
  difficulty?: string;
}

export interface NoteInput {
  content: string;
  tags?: string[];
  topic?: string;
}

export interface TeachingInput {
  topic: string;
  confidence: string;
  content: string;
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
  topic: string;
  subtype: InsightType;
  content: string;
  source: "auto";
}

export interface LearningInput {
  topic: string; // "spanish", "guitar", "kubernetes" - the learning topic
  persona: string; // "marcus", "elena", etc.
  content: string; // "Covered verb conjugations, struggles with subjunctive"
  session_summary?: string; // Longer form session notes
}

export type ObservationSubtype =
  | "term"
  | "style"
  | "pattern"
  | "preference"
  | "context";

export type ObservationConfidence = "inferred" | "stated" | "verified";

export interface ObservationInput {
  topic: string;
  content: string;
  subtype: ObservationSubtype;
  confidence: ObservationConfidence;
  source?: string;
}

interface TaskEvent {
  event: "captured";
  type: "task";
  timestamp: string;
  data: {
    topic: string;
    name: string;
    problem: string;
    solution: string;
    code?: string;
    discoveries?: string[];
    deviations?: string;
    pattern?: string;
    tags?: string[];
    tech?: string[];
    difficulty?: string;
  };
}

interface KnowledgeEvent {
  event: "captured";
  type: "knowledge";
  timestamp: string;
  data: {
    topic: string;
    content: string;
    subtype: KnowledgeCaptureType;
  };
}

interface NoteEvent {
  event: "captured";
  type: "note";
  timestamp: string;
  data: {
    content: string;
    tags?: string[];
    topic?: string;
  };
}

interface TeachingEvent {
  event: "captured";
  type: "teaching";
  timestamp: string;
  data: {
    topic: string;
    confidence: string;
    content: string;
    source: string;
  };
}

interface InsightEvent {
  event: "captured";
  type: "insight";
  timestamp: string;
  data: {
    session_id: string;
    topic: string;
    subtype: InsightType;
    content: string;
    source: "auto";
  };
}

interface LearningEvent {
  event: "captured";
  type: "learning";
  timestamp: string;
  data: {
    topic: string; // Learning topic (spanish, guitar, etc.)
    persona: string;
    content: string;
    session_summary?: string;
  };
}

interface ObservationEvent {
  event: "captured";
  type: "observation";
  timestamp: string;
  data: {
    topic: string;
    content: string;
    subtype: ObservationSubtype;
    confidence: ObservationConfidence;
    source: string;
  };
}

type CaptureEvent =
  | TaskEvent
  | KnowledgeEvent
  | NoteEvent
  | TeachingEvent
  | InsightEvent
  | LearningEvent
  | ObservationEvent;

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
  const eventWithTimestamp = {
    ...event,
    timestamp: getTimestamp(),
  } as CaptureEvent;
  const jsonLine = JSON.stringify(eventWithTimestamp) + "\n";

  try {
    appendFileSync(logPath, jsonLine, "utf8");
    return { success: true, event: eventWithTimestamp };
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
  if (!VALID_KNOWLEDGE_TYPES.includes(input.subtype)) {
    return {
      success: false,
      error: `Invalid subtype: ${input.subtype}. Must be one of: ${VALID_KNOWLEDGE_TYPES.join(", ")}`,
    };
  }

  const event: KnowledgeEvent = {
    event: "captured",
    type: "knowledge",
    timestamp: "",
    data: {
      topic: input.topic,
      content: input.content,
      subtype: input.subtype,
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
      topic: input.topic,
      name: input.name,
      problem: input.problem,
      solution: input.solution,
      code: input.code,
      discoveries: input.discoveries,
      deviations: input.deviations,
      pattern: input.pattern,
      tags: input.tags,
      tech: input.tech,
      difficulty: input.difficulty,
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
      content: input.content,
      tags: input.tags,
      topic: input.topic,
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
      topic: input.topic,
      confidence: input.confidence,
      content: input.content,
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
  if (!VALID_INSIGHT_TYPES.includes(input.subtype)) {
    return {
      success: false,
      error: `Invalid subtype: ${input.subtype}. Must be one of: ${VALID_INSIGHT_TYPES.join(", ")}`,
    };
  }

  const event: InsightEvent = {
    event: "captured",
    type: "insight",
    timestamp: "",
    data: {
      session_id: input.session_id,
      topic: input.topic,
      subtype: input.subtype,
      content: input.content,
      source: input.source,
    },
  };

  return writeEvent(event);
}

/**
 * Capture a learning session progress
 */
export function captureLearning(input: LearningInput): CaptureResult {
  if (!input.topic || !input.persona || !input.content) {
    return {
      success: false,
      error: "Missing required fields: topic, persona, content",
    };
  }

  const event: LearningEvent = {
    event: "captured",
    type: "learning",
    timestamp: "",
    data: {
      topic: input.topic,
      persona: input.persona,
      content: input.content,
      session_summary: input.session_summary,
    },
  };

  return writeEvent(event);
}

const VALID_OBSERVATION_SUBTYPES: ObservationSubtype[] = [
  "term",
  "style",
  "pattern",
  "preference",
  "context",
];

const VALID_OBSERVATION_CONFIDENCE: ObservationConfidence[] = [
  "inferred",
  "stated",
  "verified",
];

/**
 * Capture a model observation about user patterns
 */
export function captureObservation(input: ObservationInput): CaptureResult {
  if (!VALID_OBSERVATION_SUBTYPES.includes(input.subtype)) {
    return {
      success: false,
      error: `Invalid subtype: ${input.subtype}. Must be one of: ${VALID_OBSERVATION_SUBTYPES.join(", ")}`,
    };
  }

  if (!VALID_OBSERVATION_CONFIDENCE.includes(input.confidence)) {
    return {
      success: false,
      error: `Invalid confidence: ${input.confidence}. Must be one of: ${VALID_OBSERVATION_CONFIDENCE.join(", ")}`,
    };
  }

  const event: ObservationEvent = {
    event: "captured",
    type: "observation",
    timestamp: "",
    data: {
      topic: input.topic,
      content: input.content,
      subtype: input.subtype,
      confidence: input.confidence,
      source: input.source || "auto",
    },
  };

  return writeEvent(event);
}

export type { CaptureEvent };
