/**
 * lib/indexers/index.ts - Indexer registry
 *
 * Maps source names to indexer functions.
 * Populated by tasks 3.1, 3.2, 3.3.
 */

import type { IndexerFunction } from "../indexer";
import { indexEvents } from "./events";
import { indexLearnings } from "./learnings";
import { indexReadmes } from "./readmes";
import { indexDevelopment } from "./development";

export const indexers: Record<string, IndexerFunction> = {
  events: indexEvents,
  learnings: indexLearnings,
  readmes: indexReadmes,
  development: indexDevelopment,
};
