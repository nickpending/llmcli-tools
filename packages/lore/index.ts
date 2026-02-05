/**
 * lore - Library exports
 *
 * Unified knowledge CLI: search, list, and capture indexed knowledge.
 * Self-contained package with zero workspace dependencies.
 *
 * Usage:
 *   import { search, list, captureKnowledge } from "lore";
 */

// Search
export {
  search,
  listSources,
  type SearchResult,
  type SearchOptions,
} from "./lib/search";

// List
export {
  list,
  formatBriefList,
  SOURCES,
  type Source,
  type ListOptions,
  type ListEntry,
  type ListResult,
} from "./lib/list";

// Info
export {
  info,
  formatInfoHuman,
  type SourceInfo,
  type InfoOutput,
} from "./lib/info";

// Projects
export { projects } from "./lib/projects";

// About
export {
  about,
  formatBriefAbout,
  type AboutResult,
  type AboutOptions,
} from "./lib/about";

// Prismis integration
export {
  searchPrismis,
  type PrismisSearchResult,
  type PrismisSearchOptions,
} from "./lib/prismis";

// Atuin integration
export {
  searchAtuin,
  type AtuinSearchResult,
  type AtuinSearchOptions,
} from "./lib/atuin";

// Capture
export {
  captureKnowledge,
  captureTask,
  captureNote,
  captureTeaching,
  captureInsight,
  captureLearning,
  captureObservation,
  type CaptureResult,
  type KnowledgeInput,
  type KnowledgeCaptureType,
  type TaskInput,
  type NoteInput,
  type TeachingInput,
  type InsightInput,
  type InsightType,
  type LearningInput,
  type ObservationInput,
  type ObservationSubtype,
  type ObservationConfidence,
  type CaptureEvent,
} from "./lib/capture";

// Semantic search
export {
  semanticSearch,
  formatBriefSearch,
  embedQuery,
  hasEmbeddings,
  type SemanticResult,
  type SemanticSearchOptions,
} from "./lib/semantic";

// Real-time indexing
export { indexAndEmbed } from "./lib/realtime";
