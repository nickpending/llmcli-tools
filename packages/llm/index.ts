/**
 * @voidwire/llm - LLM tooling library
 *
 * Embed server lifecycle management.
 *
 * Usage:
 *   import { startEmbedServer, stopEmbedServer, getEmbedServerStatus } from "@voidwire/llm";
 */

export {
  startEmbedServer,
  stopEmbedServer,
  getEmbedServerStatus,
  type StartResult,
  type StopResult,
  type ServerStatus,
} from "./lib/lifecycle";
