/**
 * lib/lifecycle.ts - Embed server lifecycle management
 *
 * Start, stop, and status for the embed server process.
 * Uses PID file for clean shutdown. Idempotent start (health check first).
 *
 * Usage:
 *   import { startEmbedServer, stopEmbedServer, getEmbedServerStatus } from "./lifecycle";
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { resolveService } from "@voidwire/llm-core";

const DATA_DIR = join(homedir(), ".local", "share", "llm");
const PID_FILE = join(DATA_DIR, "embed-server.pid");

/**
 * Parse port from a base_url string.
 * Defaults to 8090 if no explicit port.
 */
function parsePort(baseUrl: string): number {
  const url = new URL(baseUrl);
  const port = url.port;
  return port ? parseInt(port, 10) : 8090;
}

/**
 * Check if the embed server is healthy at the given base URL.
 */
async function healthCheck(baseUrl: string, timeoutMs = 500): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Read PID from PID file, or null if not found.
 */
function readPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    const raw = readFileSync(PID_FILE, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Write PID to PID file.
 */
function writePid(pid: number): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid));
}

/**
 * Remove PID file.
 */
function removePid(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // File doesn't exist — fine
  }
}

export interface StartResult {
  status: "started" | "already_running";
  pid?: number;
  port: number;
}

/**
 * Start the embed server idempotently.
 * If already running (health check passes), returns immediately.
 * Otherwise spawns the server, polls health, and writes PID.
 */
export async function startEmbedServer(): Promise<StartResult> {
  const service = resolveService("embed");
  const baseUrl = service.base_url;
  const port = parsePort(baseUrl);

  // Health check — already running?
  if (await healthCheck(baseUrl)) {
    return { status: "already_running", pid: readPid() ?? undefined, port };
  }

  // Resolve path to embed-server.ts (co-located in this package)
  const embedServerPath = join(import.meta.dir, "embed-server.ts");

  // Spawn detached process
  const proc = Bun.spawn(["bun", "run", embedServerPath], {
    env: { ...process.env, EMBED_PORT: String(port) },
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  });

  // Detach from parent — let it run independently
  proc.unref();

  const pid = proc.pid;
  writePid(pid);

  // Poll /health every 100ms up to 3s
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await healthCheck(baseUrl)) {
      return { status: "started", pid, port };
    }
  }

  throw new Error(
    `Embed server failed to start within 3s (pid: ${pid}, port: ${port}). ` +
      `Check logs or try: EMBED_PORT=${port} bun run ${embedServerPath}`,
  );
}

export interface StopResult {
  status: "stopped" | "not_running";
  pid?: number;
}

/**
 * Stop the embed server via PID file.
 * Gracefully handles missing PID file.
 */
export async function stopEmbedServer(): Promise<StopResult> {
  const pid = readPid();

  if (pid === null) {
    return { status: "not_running" };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process already dead — fine
  }

  removePid();
  return { status: "stopped", pid };
}

export interface ServerStatus {
  running: boolean;
  pid?: number;
  port: number;
  model?: string;
  dims?: number;
}

/**
 * Get the current status of the embed server.
 */
export async function getEmbedServerStatus(): Promise<ServerStatus> {
  const service = resolveService("embed");
  const baseUrl = service.base_url;
  const port = parsePort(baseUrl);
  const pid = readPid() ?? undefined;

  try {
    const resp = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(500),
    });

    if (resp.ok) {
      const data = (await resp.json()) as {
        model?: string;
        dims?: number;
      };
      return {
        running: true,
        pid,
        port,
        model: data.model,
        dims: data.dims,
      };
    }
  } catch {
    // Server not reachable
  }

  return { running: false, pid, port };
}
