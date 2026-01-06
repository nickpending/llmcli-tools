# llm-notify

Queue notifications for Claude awareness from external systems.

## Philosophy

**Async awareness** - External systems (CI, cron, monitoring) emit notifications that Claude can consume when convenient.

**Three tiers** - Urgent interrupts, indicators persist until acked, silent logs for audit trails.

**JSONL queue** - Append-only file at `~/.local/state/momentum/notifications.jsonl` for durability and simplicity.

## Quick Start

```bash
# CI build failure (urgent - Claude sees immediately)
llm-notify emit --source ci --tier urgent --message "Build failed on main"

# Daily backup complete (indicator - shown when convenient)
llm-notify emit --source cron --tier indicator --message "Daily backup completed"

# Heartbeat (silent - logged but not surfaced)
llm-notify emit --source monitoring --tier silent --message "Service healthy"
```

## Installation

```bash
cd packages/llm-notify
bun link
```

Now `llm-notify` is available globally.

## Usage

```
llm-notify emit --source <name> --tier <tier> --message <text>
```

### Required Arguments

- `--source <name>` - Source name (e.g., "ci", "cron", "monitoring")
- `--tier <tier>` - Notification tier: `urgent`, `indicator`, `silent`
- `--message <text>` - Human-readable message

### Tiers

| Tier | Behavior |
|------|----------|
| `urgent` | Interrupt - show immediately, auto-ack after injection |
| `indicator` | Show when convenient - persists until manually acked |
| `silent` | Log only - never surfaced to Claude |

## Output Format

```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Library Usage

```typescript
import { emit } from "@voidwire/llm-notify";

const result = emit("ci", "urgent", "Build failed on main");
if (result.success) {
  console.log(`Notification queued: ${result.id}`);
}
```

## Architecture

- **Zero dependencies** - Uses Node.js built-ins only
- **XDG compliant** - Respects `XDG_STATE_HOME`, defaults to `~/.local/state`
- **Append-only** - JSONL format for crash safety
- **UUID identifiers** - Each notification gets a unique ID

## Error Handling

**Exit codes:**
- `0` - Notification queued successfully
- `2` - Client error (missing args, write failure)

## Related

- [Momentum](https://github.com/nickpending/momentum) - Claude Code workflow system that consumes these notifications
- [argus-send](../argus-send/) - Synchronous event dispatch to Argus observability
