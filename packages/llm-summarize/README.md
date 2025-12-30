# llm-summarize

Structured session insight extraction for knowledge systems.

## Philosophy

- **Config-driven** - No hardcoded defaults, specify exact provider/model
- **Prismis pattern** - Secrets in .env, references in config.toml via `env:VAR_NAME`
- **Knowledge-focused** - Extracts decisions, patterns, preferences, not just summaries
- **Composable** - JSON output pipes to jq and other tools

## Installation

```bash
cd llmcli-tools
./install.sh llm-summarize
```

## Configuration

### Config file: `~/.config/llm/config.toml`

```toml
[llm]
provider = "ollama"
model = "Qwen2.5:3b"
api_base = "https://ollama.example.com"
max_tokens = 1024
```

### Secrets file: `~/.config/llm/.env`

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# From stdin (typical usage)
cat session.txt | llm-summarize --stdin

# From clipboard
pbpaste | llm-summarize --stdin

# Direct text
llm-summarize "session transcript text"
```

## Options

| Flag | Description |
|------|-------------|
| `--model <name>` | Override model from config |
| `--max-tokens <n>` | Max output tokens (default: 1024) |
| `--stdin` | Read text from stdin |
| `-h, --help` | Show help |

## Output

```json
{
  "insights": {
    "summary": "Implemented Redis caching layer with TTL and tag-based invalidation.",
    "decisions": [
      "Chose Redis over in-memory caching for persistence across restarts"
    ],
    "patterns_used": [
      "Tag-based cache invalidation"
    ],
    "problems_solved": [
      "Added caching to reduce database load with automatic invalidation on writes"
    ],
    "tools_heavy": [
      "Redis",
      "CacheService"
    ]
  },
  "model": "Qwen2.5:3b",
  "tokens_used": 126
}
```

### SessionInsights Fields

| Field | Description |
|-------|-------------|
| `summary` | One sentence: what was accomplished (always present) |
| `decisions` | Specific decisions with reasoning |
| `patterns_used` | Development patterns observed |
| `preferences_expressed` | User preferences revealed |
| `problems_solved` | Problems addressed and how |
| `tools_heavy` | Tools used notably |

Fields are omitted when no clear evidence exists in the transcript.

## Supported Providers

| Provider | Models | API Key |
|----------|--------|---------|
| `ollama` | Qwen2.5:3b, llama3.2:3b, etc. | Not needed |
| `anthropic` | claude-3-5-haiku-latest, claude-sonnet-4-20250514 | Required |
| `openai` | gpt-4o-mini, gpt-4o | Required |

### Ollama Configuration

```toml
[llm]
provider = "ollama"
model = "Qwen2.5:3b"
api_base = "https://ollama.example.com"
max_tokens = 1024
```

### Cloud Provider Configuration

```toml
[llm]
provider = "anthropic"
model = "claude-3-5-haiku-latest"
api_key = "env:ANTHROPIC_API_KEY"
max_tokens = 1024
```

## Library Usage

```typescript
import { summarize, loadConfig, type SessionInsights } from "@voidwire/llm-summarize";

const config = loadConfig();
const result = await summarize("session transcript", config);

if (result.insights) {
  console.log(result.insights.summary);
  console.log(result.insights.decisions);
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error (rate limit, auth, network, parse failure) |
| 2 | Client error (missing args, invalid config) |
