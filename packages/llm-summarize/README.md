# llm-summarize

Fast LLM-powered text summarization for observability and logging.

## Philosophy

- **Config-driven** - No hardcoded defaults, specify exact provider/model
- **Prismis pattern** - Secrets in .env, references in config.toml via `env:VAR_NAME`
- **Fast and cheap** - Designed for high-volume summarization (haiku/gpt-4.1-mini)
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
provider = "openai"
model = "gpt-4.1-mini"
api_key = "env:OPENAI_API_KEY"
max_tokens = 50
```

### Secrets file: `~/.config/llm/.env`

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
llm-summarize <text>
llm-summarize --stdin
echo "text" | llm-summarize --stdin
```

## Options

| Flag | Description |
|------|-------------|
| `--model <name>` | Override model from config |
| `--max-tokens <n>` | Max output tokens |
| `--stdin` | Read text from stdin |
| `-h, --help` | Show help |

## Output

```json
{
  "summary": "User saved form data to PostgreSQL.",
  "model": "gpt-4.1-mini",
  "tokens_used": 12
}
```

## Supported Providers

| Provider | Models | API Key |
|----------|--------|---------|
| `anthropic` | claude-3-5-haiku-latest, claude-sonnet-4-20250514 | Required |
| `openai` | gpt-4.1-mini, gpt-4o | Required |
| `ollama` | llama3, mistral, gemma3, etc. | Not needed |

### Ollama Configuration

```toml
[llm]
provider = "ollama"
model = "llama3"
api_base = "http://localhost:11434/api/generate"  # optional, this is default
max_tokens = 50
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error (rate limit, auth, network) |
| 2 | Client error (missing args, invalid config) |
