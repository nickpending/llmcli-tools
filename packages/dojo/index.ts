// Types
export type {
  DomainState,
  ConceptNode,
  ConceptProgress,
  SessionEntry,
  Resource,
  Source,
  Assignment,
  LearningContext,
  MasteryLevel,
  FSRSRating,
  ResourceType,
  ResourceQuality,
  SourceType,
  CurriculumOrigin,
  AssignmentOutcome,
} from "./lib/types";

// Config
export { getConfig } from "./lib/config";
export type { DojoConfig } from "./lib/config";

// State
export {
  domainExists,
  readDomain,
  writeDomain,
  listDomains,
  initDomain,
  updateDomain,
  validateDomainState,
} from "./lib/state";

// Session
export { recordSession, getSessionStatus } from "./lib/session";
export type { SessionStatus } from "./lib/session";

// Curriculum
export {
  addConcept,
  setConceptResources,
  validateCurriculum,
  verifyUrls,
} from "./lib/curriculum";

// FSRS / Progress
export {
  updateProgress,
  getDueConcepts,
  getReadyConcepts,
  addConfusionPair,
  getNudgeStatus,
} from "./lib/fsrs";

// DueConcept type
export type { DueConcept } from "./lib/types";
