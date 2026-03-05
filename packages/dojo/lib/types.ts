import type { Card } from "ts-fsrs";

// Domain learning context
export type LearningContext =
  | "sprint"
  | "skill-build"
  | "problem-solve"
  | "deep-mastery";

// Mastery levels for concepts
export type MasteryLevel =
  | "none"
  | "introduced"
  | "practiced"
  | "reinforced"
  | "solid";

// FSRS rating vocabulary
export type FSRSRating = "again" | "hard" | "good" | "easy";

// Resource classification
export type ResourceType =
  | "docs"
  | "video"
  | "book"
  | "course"
  | "tool"
  | "article";
export type ResourceQuality = "essential" | "recommended" | "supplementary";

// Source material types
export type SourceType = "book" | "url" | "video" | "course";

// Curriculum generation origin
export type CurriculumOrigin = "sources" | "model-knowledge" | "hybrid";

// Assignment outcomes
export type AssignmentOutcome = "nailed" | "struggled" | "partial";

export interface Resource {
  title: string;
  url: string;
  type: ResourceType;
  quality: ResourceQuality;
  free: boolean;
  note: string;
}

export interface Source {
  type: SourceType;
  path_or_url: string;
  title: string;
  scanned: boolean;
}

export interface ConceptNode {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  difficulty_estimate: number;
  source_refs: string[];
  resources: Resource[];
}

export interface Assignment {
  assignment: string;
  outcome: AssignmentOutcome;
  approach_used: string;
  timestamp: string;
}

export interface ConceptProgress {
  mastery: MasteryLevel;
  fsrs_card: Card;
  struggle_points: string[];
  confusion_pairs: string[];
  assignments: Assignment[];
}

export interface SessionEntry {
  date: string;
  time_of_day: string;
  duration_minutes: number;
  concepts_covered: string[];
  persona: string;
  context: string;
  calibration: "too-easy" | "right" | "too-hard";
  confusion_pairs_encountered: string[];
  resources_suggested: Resource[];
  resources_used: string[];
  breakthrough_moments: string[];
  struggle_descriptions: string[];
}

export interface DueConcept {
  concept_id: string;
  title: string;
  due: string;
  state: number;
  mastery: MasteryLevel;
  confusion_pair: boolean;
}

export interface DomainState {
  domain: string;
  goal: string;
  context: LearningContext;
  persona: string;
  sources: Source[];
  curriculum: {
    concepts: ConceptNode[];
    generated_from: CurriculumOrigin;
    generated_at: string;
  };
  progress: Record<string, ConceptProgress>;
  session_history: SessionEntry[];
  session_count: number;
  last_session: string | null;
}
