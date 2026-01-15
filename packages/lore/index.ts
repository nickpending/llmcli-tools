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
  listDomains,
  DOMAINS,
  type Domain,
  type ListOptions,
  type ListEntry,
  type ListResult,
} from "./lib/list";

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
  type CaptureResult,
  type KnowledgeInput,
  type KnowledgeCaptureType,
  type TaskInput,
  type NoteInput,
  type TeachingInput,
  type CaptureEvent,
} from "./lib/capture";

// Semantic search
export {
  semanticSearch,
  embedQuery,
  hasEmbeddings,
  type SemanticResult,
  type SemanticSearchOptions,
} from "./lib/semantic";
