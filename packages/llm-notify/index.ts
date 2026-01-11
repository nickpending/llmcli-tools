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

import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "fs";
import { join } from "path";
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

export interface AckResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface PruneResult {
  success: boolean;
  pruned?: number;
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
  return join(baseDir, "llm-notify");
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

/**
 * List notifications from the queue
 *
 * @param unackedOnly - If true, only return unacked notifications
 * @returns Array of notifications (empty if file missing or empty)
 */
export function list(unackedOnly: boolean = false): Notification[] {
  const queuePath = getQueuePath();

  if (!existsSync(queuePath)) {
    return [];
  }

  try {
    const content = readFileSync(queuePath, "utf-8").trim();
    if (!content) {
      return [];
    }

    const notifications: Notification[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const notification = JSON.parse(line) as Notification;
        if (unackedOnly && notification.acked) continue;
        notifications.push(notification);
      } catch {
        // Skip malformed lines silently
      }
    }

    return notifications;
  } catch {
    return [];
  }
}

/**
 * Write notifications to queue file atomically
 * Uses temp file + rename pattern to prevent corruption
 *
 * @param notifications - Array of notifications to write
 * @returns true if successful, false otherwise
 */
function writeQueue(notifications: Notification[]): boolean {
  if (!ensureStateDir()) {
    return false;
  }

  const queuePath = getQueuePath();
  const tempPath = queuePath + ".tmp";

  try {
    const content = notifications.map((n) => JSON.stringify(n)).join("\n");
    writeFileSync(tempPath, content ? content + "\n" : "");
    renameSync(tempPath, queuePath);
    return true;
  } catch {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}

/**
 * Acknowledge a notification by ID
 *
 * @param id - Notification ID to acknowledge
 * @returns AckResult with success status
 */
export function ack(id: string): AckResult {
  const notifications = list(false);
  const index = notifications.findIndex((n) => n.id === id);

  if (index === -1) {
    return {
      success: false,
      error: `Notification not found: ${id}`,
    };
  }

  notifications[index].acked = true;

  if (!writeQueue(notifications)) {
    return {
      success: false,
      error: "Failed to write queue",
    };
  }

  return {
    success: true,
    id,
  };
}

/**
 * Prune notifications older than specified days
 *
 * @param days - Remove notifications older than this many days (default: 7)
 * @returns PruneResult with count of pruned notifications
 */
export function prune(days: number = 7): PruneResult {
  const notifications = list(false);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const kept = notifications.filter((n) => new Date(n.timestamp) >= cutoff);
  const pruned = notifications.length - kept.length;

  if (!writeQueue(kept)) {
    return {
      success: false,
      error: "Failed to write queue",
    };
  }

  return {
    success: true,
    pruned,
  };
}
