/**
 * lore-search - Library exports
 *
 * Query Lore's FTS5 database for indexed content across all domains.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { search, listSources } from "lore-search";
 *   const results = search("authentication", { limit: 10 });
 */

/// <reference types="bun-types" />

// Re-export from lib/search.ts
export {
  search,
  listSources,
  type SearchResult,
  type SearchOptions,
} from "./lib/search";
