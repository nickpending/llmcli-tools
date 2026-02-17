/**
 * llm-core - Shared LLM transport layer
 *
 * Service-based routing to provider APIs with normalized envelope.
 * Pure functions, no process.exit, no stderr output in library.
 *
 * Usage:
 *   import { complete, loadServices, listServices } from "@voidwire/llm-core";
 */

// Re-export types
export type {
  CompleteOptions,
  CompleteResult,
  ServiceConfig,
  ServiceMap,
  AdapterRequest,
  AdapterResponse,
  ProviderAdapter,
} from "./lib/types";

// Service resolution (task 2.2)
export { loadServices, resolveService, listServices } from "./lib/services";

// Config / credential loading (task 2.2)
export { loadApiKey } from "./lib/config";

// Core orchestration (task 2.5)
export { complete } from "./lib/core";

// Retry logic (task 2.4)
export { withRetry } from "./lib/retry";
export type { RetryOptions } from "./lib/retry";

// Helpers (task 2.4)
export { extractJson, isTruncated } from "./lib/helpers";

// Pricing (task 2.4)
export { estimateCost, updatePricing } from "./lib/pricing";
