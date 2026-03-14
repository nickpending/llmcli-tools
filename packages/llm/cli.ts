#!/usr/bin/env bun
/**
 * llm CLI - LLM tooling subcommands
 *
 * Manages embedding infrastructure. The embed server loads
 * nomic-embed-text-v1.5 once on startup and serves embedding
 * requests at ~9ms per query, eliminating cold start overhead.
 *
 * Usage:
 *   llm embed-server start    Start the embed server (idempotent)
 *   llm embed-server stop     Stop the embed server
 *   llm embed-server status   Show embed server status
 *
 * All commands output JSON to stdout. Diagnostics to stderr.
 * Exit codes: 0 = success, 1 = runtime error, 2 = client error (bad args)
 */

import {
  startEmbedServer,
  stopEmbedServer,
  getEmbedServerStatus,
} from "./lib/lifecycle";

function printUsage(): void {
  process.stderr.write(`llm - LLM tooling CLI

Philosophy:
  Centralize LLM infrastructure into deterministic, composable commands.
  The embed server is shared infrastructure — start once, use everywhere.

Usage:
  llm embed-server start    Start the embed server (idempotent)
  llm embed-server stop     Stop the embed server
  llm embed-server status   Show embed server status

All commands output JSON to stdout. Diagnostics to stderr.
Exit codes: 0 = success, 1 = runtime error, 2 = client error
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const [command, subcommand] = args;

  if (command !== "embed-server") {
    process.stderr.write(`Error: Unknown command "${command}"\n\n`);
    printUsage();
    process.exit(2);
  }

  try {
    switch (subcommand) {
      case "start": {
        const result = await startEmbedServer();
        console.log(JSON.stringify(result));
        if (result.status === "already_running") {
          process.stderr.write("Embed server already running\n");
        } else {
          process.stderr.write(
            `Embed server started (pid: ${result.pid}, port: ${result.port})\n`,
          );
        }
        process.exit(0);
        break;
      }

      case "stop": {
        const result = await stopEmbedServer();
        console.log(JSON.stringify(result));
        if (result.status === "not_running") {
          process.stderr.write("Embed server not running\n");
        } else {
          process.stderr.write(`Embed server stopped (pid: ${result.pid})\n`);
        }
        process.exit(0);
        break;
      }

      case "status": {
        const status = await getEmbedServerStatus();
        console.log(JSON.stringify(status));
        process.exit(0);
        break;
      }

      default:
        process.stderr.write(
          `Error: Unknown subcommand "${subcommand}". Use: start, stop, status\n`,
        );
        process.exit(2);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main();
