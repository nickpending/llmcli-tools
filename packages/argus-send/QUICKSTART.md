# argus-send Quick Start

Practical examples for sending events to Argus from command line and tools.

## Basic Usage

### Simple Event

```bash
argus-send --source my-app --type startup --level info
```

Output:
```json
{
  "captured": true,
  "event_id": 45
}
```

### Event with Message

```bash
argus-send \
  --source momentum \
  --type task-complete \
  --message "Completed task 12" \
  --level info
```

### Event with Structured Data

```bash
argus-send \
  --source llcli-tools \
  --type gitignore-check \
  --message "Compliance check failed" \
  --level warn \
  --data '{"missing": 96, "sources": ["base", "macos", "typescript"]}'
```

## Piping from Other Tools

### From gitignore-check

```bash
# Send full compliance result
gitignore-check . | argus-send \
  --source llcli-tools \
  --type gitignore-check \
  --stdin
```

### From language-detect

```bash
# Track language detection
language-detect . | argus-send \
  --source llcli-tools \
  --type language-detect \
  --stdin
```

### Transform with jq Before Sending

```bash
# Extract just the count of missing patterns
gitignore-check . | jq '{missing_count: (.missing | length)}' | argus-send \
  --source llcli-tools \
  --type compliance-summary \
  --stdin
```

## Tool Integration Patterns

### Conditional Sending (Only on Failure)

```bash
#!/bin/bash
result=$(gitignore-check .)
compliant=$(echo "$result" | jq -r '.compliant')

if [ "$compliant" != "true" ]; then
  echo "$result" | argus-send \
    --source llcli-tools \
    --type gitignore-failure \
    --level warn \
    --stdin
fi
```

### Send Summary After Multiple Operations

```bash
#!/bin/bash
# Check multiple projects
for project in ~/development/projects/*; do
  result=$(gitignore-check "$project")
  compliant=$(echo "$result" | jq -r '.compliant')

  if [ "$compliant" != "true" ]; then
    missing=$(echo "$result" | jq -r '.missing | length')

    argus-send \
      --source batch-checker \
      --type project-non-compliant \
      --message "Project: $(basename "$project")" \
      --level warn \
      --data "{\"project\": \"$(basename "$project")\", \"missing\": $missing}"
  fi
done
```

## Momentum Hook Integration

### Session Start Hook

```typescript
// In momentum-session-start-hook.ts
const sessionStart = Bun.spawnSync([
  "argus-send",
  "--source", "momentum",
  "--type", "session-start",
  "--message", `Project: ${projectName}`,
  "--level", "info",
  "--data", JSON.stringify({
    project: projectName,
    mode: currentMode
  })
]);
```

### Task Completion Hook

```typescript
// After task completes
const taskEvent = Bun.spawnSync([
  "argus-send",
  "--source", "momentum",
  "--type", "task-complete",
  "--message", `Task ${taskNumber} completed`,
  "--level", "info",
  "--data", JSON.stringify({
    task_number: taskNumber,
    task_name: taskName,
    duration_seconds: durationSeconds
  })
]);
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Check gitignore compliance
  run: |
    gitignore-check . | argus-send \
      --source ci \
      --type gitignore-check \
      --message "GitHub Actions check" \
      --stdin
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check compliance before commit
result=$(gitignore-check .)
compliant=$(echo "$result" | jq -r '.compliant')

# Send event to Argus
echo "$result" | argus-send \
  --source git-hooks \
  --type pre-commit-check \
  --stdin

# Block commit if non-compliant
if [ "$compliant" != "true" ]; then
  echo "❌ Gitignore non-compliant. Run: gitignore-check . --fix"
  exit 1
fi
```

## Error Tracking

### Catching Tool Failures

```bash
#!/bin/bash
set -e

# Run tool and capture exit code
if ! language-detect . > /tmp/detect-result.json 2>&1; then
  # Tool failed - send error event
  argus-send \
    --source llcli-tools \
    --type tool-failure \
    --message "language-detect failed" \
    --level error \
    --data "$(cat /tmp/detect-result.json)"
  exit 1
fi

# Tool succeeded - send result
cat /tmp/detect-result.json | argus-send \
  --source llcli-tools \
  --type language-detect \
  --stdin
```

## Advanced Patterns

### Rate-Limited Sending

```bash
#!/bin/bash
# Only send every 10th event (reduce noise)

counter_file="/tmp/argus-send-counter"
count=$(cat "$counter_file" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$counter_file"

if [ $((count % 10)) -eq 0 ]; then
  gitignore-check . | argus-send \
    --source periodic \
    --type compliance-check \
    --stdin
fi
```

### Batching Events

```bash
#!/bin/bash
# Collect events, send summary

results=()
for project in ~/development/projects/*; do
  result=$(gitignore-check "$project" 2>/dev/null || echo '{"compliant": false, "error": "check failed"}')
  results+=("$result")
done

# Send batch summary
summary=$(printf '%s\n' "${results[@]}" | jq -s '{
  total: length,
  compliant: [.[] | select(.compliant == true)] | length,
  non_compliant: [.[] | select(.compliant == false)] | length
}')

echo "$summary" | argus-send \
  --source batch-checker \
  --type batch-summary \
  --message "Checked $(echo "$summary" | jq -r '.total') projects" \
  --stdin
```

## Testing

### Check Argus Connection

```bash
# Simple ping to verify Argus is running
argus-send \
  --source test \
  --type ping \
  --message "Connection test" \
  --level debug

# If successful, you'll see:
# {
#   "captured": true,
#   "event_id": 123
# }
# ✅ Event captured (ID: 123)
```

### Verify Event in Argus

```bash
# Send test event
event_id=$(argus-send \
  --source test \
  --type verification \
  --message "Test event" \
  | jq -r '.event_id')

# Query Argus to confirm
curl "http://127.0.0.1:8765/events?source=test&limit=1" \
  -H "X-API-Key: $(grep api_keys ~/.config/argus/config.toml | grep -oP '"\K[^"]+')" \
  | jq '.events[0]'
```

## Troubleshooting

### Check API Key

```bash
# Verify config file exists
cat ~/.config/argus/config.toml | grep api_keys

# If missing, initialize Argus config:
cd ~/development/projects/argus
uv run argus config init
```

### Test Argus Server

```bash
# Check if Argus is running
curl http://127.0.0.1:8765/sources \
  -H "X-API-Key: your-api-key-here"

# If connection refused, start Argus:
cd ~/development/projects/argus
uv run argus serve
```

### Debug Mode

```bash
# Use stderr to see diagnostic output
argus-send \
  --source debug \
  --type test \
  --message "Debug test" \
  2>&1
```

## Performance

**Typical latency on localhost:**
- Simple event: <50ms
- Event with data: <100ms
- Piped from tool: <150ms (includes tool execution)

**Throughput:**
- Sequential: ~20 events/second
- Parallel (background jobs): ~100 events/second

## Best Practices

1. **Use meaningful sources** - Name by tool/component, not by team/repo
2. **Structured event types** - Use kebab-case: `task-complete`, `gitignore-check`
3. **Include context in data** - Put actionable info in `data` field
4. **Use appropriate levels** - `debug` for trace, `info` for status, `warn` for issues, `error` for failures
5. **Pipe full results** - Let Argus store complete data, filter in queries
6. **Test events separately** - Use `--source test` for testing, easier to filter out

## Next Steps

- View events in Argus web UI: `open http://127.0.0.1:8765`
- Query events: `curl http://127.0.0.1:8765/events?source=llcli-tools`
- Stream real-time: Open web UI and watch events appear
- Integrate with your tools: Add `argus-send` to scripts and hooks
