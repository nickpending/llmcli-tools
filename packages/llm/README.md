# llm

LLM infrastructure CLI — manage embedding servers and shared LLM services.

## Philosophy

**One server, many consumers** — The embed server loads `nomic-embed-text-v1.5` once and serves requests at ~9ms. Every tool that needs embeddings (lore, sable, future tools) hits the same server through `@voidwire/llm-core`'s `embed()` function. No in-process model loading, no duplicate codepaths.

**Idempotent lifecycle** — `start` checks health first, only spawns if needed. PID file for clean shutdown. Safe to call from multiple entry points (shell init, bin/sable, scripts).

**JSON output** — All commands emit JSON to stdout. Human-readable diagnostics go to stderr. Pipes to jq, composes with other tools.

## Quick Start

```bash
# Start the embed server (idempotent — no-op if already running)
llm embed-server start

# Check status
llm embed-server status

# Stop
llm embed-server stop
```

## Installation

```bash
bun add -g @voidwire/llm
```

Or from source:

```bash
cd packages/llm && bun link
```

## Usage

### `llm embed-server start`

Start the embedding server. Checks `/health` first — if already running, returns immediately.

```bash
llm embed-server start
# stdout: {"status":"started","pid":12345,"port":8090}
# stderr: Embed server started (pid: 12345, port: 8090)
```

### `llm embed-server stop`

Stop the server via PID file. Graceful SIGTERM.

```bash
llm embed-server stop
# stdout: {"status":"stopped","pid":12345}
# stderr: Embed server stopped (pid: 12345)
```

### `llm embed-server status`

Report server state. JSON to stdout.

```bash
llm embed-server status
# {"running":true,"port":8090,"model":"nomic-ai/nomic-embed-text-v1.5","dims":768}

llm embed-server status | jq .running
# true
```

## Library Usage

```typescript
import { startEmbedServer, stopEmbedServer, getEmbedServerStatus } from "@voidwire/llm";

const result = await startEmbedServer();
// { status: "started" | "already_running", pid?: number, port: number }
```

## Configuration

The embed server reads its endpoint from `~/.config/llm-core/services.toml`:

```toml
[services.embed]
adapter = "embed"
base_url = "http://localhost:8090"
key_required = false
default_model = "nomic-ai/nomic-embed-text-v1.5"
```

PID file: `~/.local/share/llm/embed-server.pid`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (server failed to start, etc.) |
| 2 | Client error (bad arguments) |
