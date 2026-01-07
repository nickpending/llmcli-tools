// Core operations
export {
  add,
  done,
  cancel,
  activate,
  defer,
  list,
  recurring,
  completeRecurring,
  lint,
  archive,
} from "./lib/core";

// Types
export type {
  AddOptions,
  AddResult,
  DoneResult,
  CancelResult,
  ActivateResult,
  DeferResult,
  ListOptions,
  ListResult,
  RecurringResult,
  LintIssue,
  LintResult,
  ArchiveResult,
  FluxItem,
  ItemType,
  FluxConfig,
  FluxPaths,
} from "./lib/core";

// Config utilities
export { loadConfig, getPaths, generateId } from "./lib/config";

// Parser utilities (for advanced use)
export {
  parseFile,
  parseItem,
  serializeItem,
  serializeFile,
} from "./lib/parser";
