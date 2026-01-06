/**
 * llm-notify - Library exports
 *
 * Queue notifications for Claude awareness from external systems.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { emit, getQueuePath } from "@voidwire/llm-notify";
 *   const result = await emit("ci", "urgent", "Build failed");
 */

import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

export type Tier = "urgent" | "indicator" | "silent";

export interface Notification {
  id: string;
  source: string;
  tier: Tier;
  message: string;
  timestamp: string;
  acked: boolean;
}

export interface EmitResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get XDG state directory for momentum
 * Respects XDG_STATE_HOME, defaults to ~/.local/state
 */
export function getStateDir(): string {
  const xdgState = process.env.XDG_STATE_HOME;
  const home = process.env.HOME!;
  const baseDir = xdgState || join(home, ".local", "state");
  return join(baseDir, "momentum");
}

/**
 * Get path to notifications queue file
 */
export function getQueuePath(): string {
  return join(getStateDir(), "notifications.jsonl");
}

/**
 * Ensure state directory exists
 */
export function ensureStateDir(): boolean {
  const dir = getStateDir();
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Emit a notification to the queue
 *
 * @param source - Source name (e.g., "ci", "cron", "monitoring")
 * @param tier - Notification tier: urgent, indicator, or silent
 * @param message - Human-readable message
 * @returns EmitResult with success status and notification id or error
 */
export function emit(source: string, tier: Tier, message: string): EmitResult {
  if (!ensureStateDir()) {
    return {
      success: false,
      error: `Failed to create state directory: ${getStateDir()}`,
    };
  }

  const notification: Notification = {
    id: randomUUID(),
    source,
    tier,
    message,
    timestamp: new Date().toISOString(),
    acked: false,
  };

  try {
    const queuePath = getQueuePath();
    appendFileSync(queuePath, JSON.stringify(notification) + "\n");
    return {
      success: true,
      id: notification.id,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to write to queue: ${String(error)}`,
    };
  }
}
