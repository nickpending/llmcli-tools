/**
 * argus-send - Library exports
 *
 * Send events to Argus observability platform.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { sendEvent, loadConfig } from "argus-send";
 *   const config = loadConfig();
 *   const result = await sendEvent(event, config.apiKey!, config.host);
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export type ArgusEventType =
  | "tool"
  | "session"
  | "agent"
  | "response"
  | "prompt"
  | "command"
  | "skill";

export type ArgusHook =
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "SubagentStart"
  | "SubagentStop"
  | "UserPromptSubmit";

export type ArgusStatus = "success" | "failure" | "pending";

export interface ArgusEvent {
  source: string;
  event_type: string;
  timestamp?: string;
  message?: string;
  data?: unknown;
  // Agent observability fields (send at top level, not in data)
  session_id?: string;
  hook?: ArgusHook;
  tool_name?: string;
  tool_use_id?: string;
  status?: ArgusStatus;
  agent_id?: string;
}

export interface SendResult {
  captured: boolean;
  event_id?: number;
  error?: string;
}

export interface ArgusConfig {
  host: string;
  apiKey: string | null;
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load Argus configuration from config file
 * Config: ~/.config/argus/config.toml
 *
 * @returns ArgusConfig with host URL and API key
 */
export function loadConfig(): ArgusConfig {
  const configPath = join(process.env.HOME!, ".config", "argus", "config.toml");
  const defaultHost = "http://127.0.0.1:8765";

  if (!existsSync(configPath)) {
    return { host: defaultHost, apiKey: null };
  }

  try {
    const content = readFileSync(configPath, "utf-8");

    // Parse server.host (default: 127.0.0.1)
    const hostMatch = content.match(/^\s*host\s*=\s*"([^"]+)"/m);
    const host = hostMatch ? hostMatch[1] : "127.0.0.1";

    // Parse server.port (default: 8765)
    const portMatch = content.match(/^\s*port\s*=\s*(\d+)/m);
    const port = portMatch ? portMatch[1] : "8765";

    // Parse api_keys array, extract first key
    const keysMatch = content.match(/api_keys\s*=\s*\[([^\]]+)\]/);
    let apiKey: string | null = null;
    if (keysMatch) {
      const firstKey = keysMatch[1].match(/"([^"]+)"/);
      apiKey = firstKey ? firstKey[1] : null;
    }

    return {
      host: `http://${host}:${port}`,
      apiKey,
    };
  } catch {
    return { host: defaultHost, apiKey: null };
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Send event to Argus
 *
 * @param event - The event to send
 * @param apiKey - Argus API key
 * @param host - Argus host URL (default: http://127.0.0.1:8765)
 * @returns SendResult with captured status and event_id or error
 */
export async function sendEvent(
  event: ArgusEvent,
  apiKey: string,
  host: string = "http://127.0.0.1:8765",
): Promise<SendResult> {
  try {
    // Add timestamp if missing
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    const response = await fetch(`${host}/events`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventWithTimestamp),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        captured: false,
        error: `HTTP ${response.status}: ${text}`,
      };
    }

    const result = await response.json();
    return {
      captured: true,
      event_id: result.event_id,
    };
  } catch (error) {
    return {
      captured: false,
      error: `Connection failed: ${String(error)}`,
    };
  }
}

/**
 * Send event using config from loadConfig()
 * Convenience function that handles config loading
 *
 * @param event - The event to send
 * @returns SendResult with captured status and event_id or error
 */
export async function send(event: ArgusEvent): Promise<SendResult> {
  const config = loadConfig();

  // Check environment overrides
  const apiKey = process.env.ARGUS_API_KEY || config.apiKey;
  const host = process.env.ARGUS_HOST || config.host;

  if (!apiKey) {
    return {
      captured: false,
      error: "API key not found (check ~/.config/argus/config.toml)",
    };
  }

  return sendEvent(event, apiKey, host);
}
