# llm-summarize - Quick Start

## Setup

```bash
# Create config directory
mkdir -p ~/.config/llm

# Create config file
cat > ~/.config/llm/config.toml << 'EOF'
[llm]
provider = "openai"
model = "gpt-4.1-mini"
api_key = "env:OPENAI_API_KEY"
max_tokens = 50
EOF

# Add API key to .env
echo "OPENAI_API_KEY=sk-your-key-here" >> ~/.config/llm/.env
```

## Common Examples

```bash
# Simple summarization
llm-summarize "User requested fix for post-password-reset login failure"

# Pipe from stdin
echo "Tool: Edit, File: auth.ts, Result: added JWT validation" | llm-summarize --stdin

# Override max tokens
llm-summarize --max-tokens 30 "Long event description..."

# Pipe to jq
llm-summarize "Some text" | jq -r '.summary'

# Use in scripts
SUMMARY=$(llm-summarize "Event data" | jq -r '.summary')
```

## Observability Integration

```bash
# Summarize tool usage for logging
echo "Edit file src/auth.ts line 45-67, added token refresh logic" | \
  llm-summarize --stdin | \
  jq -r '.summary'

# Batch summarize events
cat events.jsonl | while read event; do
  echo "$event" | jq -r '.description' | llm-summarize --stdin
done
```
