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

// Capture
export {
  captureKnowledge,
  captureTask,
  captureNote,
  type CaptureResult,
  type KnowledgeInput,
  type KnowledgeCaptureType,
  type TaskInput,
  type NoteInput,
  type CaptureEvent,
} from "./lib/capture";
