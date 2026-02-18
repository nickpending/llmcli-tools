/**
 * llm-core - Shared LLM transport layer
 *
 * Service-based routing to provider APIs with normalized envelope.
 * Pure functions, no process.exit, no stderr output in library.
 *
 * Usage:
 *   import { complete, loadServices, listServices } from "@voidwire/llm-core";
 */

export type {
  CompleteOptions,
  CompleteResult,
  ServiceConfig,
  ServiceMap,
} from "./lib/types";

export { complete } from "./lib/core";
export { loadServices, resolveService, listServices } from "./lib/services";
