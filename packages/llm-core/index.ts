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

import type { CompleteOptions, CompleteResult, ServiceMap } from "./lib/types";

// Placeholder exports (implemented in subsequent tasks)
export async function complete(
  options: CompleteOptions,
): Promise<CompleteResult> {
  throw new Error("Not implemented - task 2.2+");
}

export function loadServices(): ServiceMap {
  throw new Error("Not implemented - task 2.2");
}

export function listServices(): string[] {
  throw new Error("Not implemented - task 2.2");
}

export function extractJson<T>(text: string): T | null {
  throw new Error("Not implemented - task 2.4");
}

export function isTruncated(result: CompleteResult): boolean {
  throw new Error("Not implemented - task 2.4");
}

export async function updatePricing(): Promise<{ updated: number }> {
  throw new Error("Not implemented - task 2.4");
}
