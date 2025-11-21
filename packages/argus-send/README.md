# argus-send

Send events to Argus observability platform from the command line.

## Philosophy

**Synchronous delivery** - Blocks until Argus confirms event captured, ensuring durability.

**Config-aware** - Automatically reads API key from `~/.config/argus/config.toml`, no manual config needed.

**Pipes JSON** - Accepts JSON data from other tools (gitignore-check, language-detect) via stdin.

## Quick Start

```bash
# Simple event
argus-send --source momentum --type task-complete --level info

# With message and structured data
argus-send --source llcli-tools --type gitignore-check \
  --message "Checked project compliance" \
  --data '{"missing": 96, "sources": ["base", "macos"]}'

# Pipe from another tool
gitignore-check . | argus-send --source llcli-tools --type gitignore-check --stdin
```

## Installation

```bash
cd packages/argus-send
bun link
```

Now `argus-send` is available globally.

## Usage

```
argus-send --source <name> --type <event-type> [options]
```

### Required Arguments

- `--source <name>` - Source name (e.g., "llcli-tools", "momentum", "sable")
- `--type <event-type>` - Event type (e.g., "gitignore-check", "task-complete")

### Optional Arguments

- `--message <text>` - Human-readable message
- `--level <level>` - Event level: `debug`, `info`, `warn`, `error`
- `--data <json>` - JSON data string
- `--stdin` - Read data object from stdin (JSON)
- `--host <url>` - Argus host (default: `http://127.0.0.1:8765`)
- `--api-key <key>` - Override API key from config
- `-h, --help` - Show help

### Environment Variables

- `ARGUS_API_KEY` - Override config file API key
- `ARGUS_HOST` - Override default host

## Output Format

```json
{
  "captured": true,
  "event_id": 123
}
```

## Configuration

argus-send reads the API key from `~/.config/argus/config.toml` automatically:

```toml
[server]
api_keys = ["your-api-key-here"]
```

No additional config needed. If the file doesn't exist, install Argus:

```bash
cd ~/development/projects/argus
uv run argus config init
```

## Integration with Other Tools

### gitignore-check

```bash
# Send compliance check results to Argus
gitignore-check . | argus-send --source llcli-tools --type gitignore-check --stdin
```

### language-detect

```bash
# Track language detection events
language-detect . | argus-send --source llcli-tools --type language-detect --stdin
```

### Momentum Hooks

```typescript
// In momentum session-start hook
const result = Bun.spawnSync([
  "argus-send",
  "--source", "momentum",
  "--type", "session-start",
  "--level", "info"
]);
```

## Architecture

- **Zero dependencies** - Uses Bun's native `fetch`
- **TOML parsing** - Regex-based extraction (no TOML library needed)
- **Synchronous POST** - Blocks until Argus stores event
- **Stdin support** - Reads piped JSON for composability

## Why Synchronous?

Argus uses synchronous POST to guarantee event delivery before continuing. This prevents event loss on crashes and ensures observability gaps are filled.

The tool blocks until Argus returns `{"status": "captured", "event_id": 123}`, confirming the event is durably stored in SQLite with WAL mode.

## Error Handling

**Exit codes:**
- `0` - Event captured successfully
- `1` - Argus server error (connection failed, rejected event)
- `2` - Client error (missing args, invalid JSON, config not found)

**Common errors:**

```bash
# API key not found
❌ API key not found in config
# Solution: Run `uv run argus config init` in argus project

# Connection refused
❌ Failed: Connection failed: error sending request
# Solution: Start Argus server with `uv run argus serve`

# Invalid JSON
❌ Invalid JSON in --data
# Solution: Check JSON syntax, ensure proper quotes
```

## Examples

See [QUICKSTART.md](QUICKSTART.md) for comprehensive examples.

## Related

- [Argus](https://github.com/yourusername/argus) - Observability platform this tool sends to
- [gitignore-check](../gitignore-check/) - Compliance checker that can pipe to argus-send
- [language-detect](../language-detect/) - Language detector that can pipe to argus-send
