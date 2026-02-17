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
import { indexCaptures } from "./captures";
import { indexTeachings } from "./teachings";
import { indexInsights } from "./insights";
import { indexObservations } from "./observations";
import { indexExplorations } from "./explorations";
import { indexSessions } from "./sessions";
import { indexFlux } from "./flux";

export const indexers: Record<string, IndexerFunction> = {
  events: indexEvents,
  learnings: indexLearnings,
  readmes: indexReadmes,
  development: indexDevelopment,
  captures: indexCaptures,
  teachings: indexTeachings,
  insights: indexInsights,
  observations: indexObservations,
  explorations: indexExplorations,
  sessions: indexSessions,
  flux: indexFlux,
};
