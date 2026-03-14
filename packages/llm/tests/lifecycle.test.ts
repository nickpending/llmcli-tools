/**
 * tests/lifecycle.test.ts
 *
 * Integration tests for embed server lifecycle.
 * Requires the embed server to be manageable (start/stop/status).
 * Tests hit real infrastructure — no mocks.
 */

import { test, expect } from "bun:test";
import {
  startEmbedServer,
  stopEmbedServer,
  getEmbedServerStatus,
} from "../lib/lifecycle";

test("start is idempotent — returns already_running when server is up", async () => {
  // Ensure server is running first
  await startEmbedServer();

  // Second call should be idempotent
  const result = await startEmbedServer();
  expect(result.status).toBe("already_running");
  expect(result.port).toBe(8090);
});

test("status reports running server with model info", async () => {
  const status = await getEmbedServerStatus();
  expect(status.running).toBe(true);
  expect(status.port).toBe(8090);
  expect(status.model).toBe("nomic-ai/nomic-embed-text-v1.5");
  expect(status.dims).toBe(768);
});

test("stop and start cycle works", async () => {
  // Stop
  const stopResult = await stopEmbedServer();
  expect(["stopped", "not_running"]).toContain(stopResult.status);

  // Status should show not running
  const downStatus = await getEmbedServerStatus();
  expect(downStatus.running).toBe(false);

  // Start again
  const startResult = await startEmbedServer();
  expect(startResult.status).toBe("started");
  expect(startResult.pid).toBeGreaterThan(0);
  expect(startResult.port).toBe(8090);

  // Verify it's back up
  const upStatus = await getEmbedServerStatus();
  expect(upStatus.running).toBe(true);
});

test("CLI outputs JSON to stdout", async () => {
  const proc = Bun.spawn(["bun", "run", "cli.ts", "embed-server", "status"], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(0);

  const parsed = JSON.parse(stdout.trim());
  expect(parsed).toHaveProperty("running");
  expect(parsed).toHaveProperty("port");
});
