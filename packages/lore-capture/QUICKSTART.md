# lore-capture - Quick Start

Common usage patterns for the lore-capture CLI.

## Basic Usage

```bash
# Simple note
lore-capture note --text="Remember to test edge cases"

# Note with tags
lore-capture note --text="Check API rate limits" --tags=api,performance

# Note with context
lore-capture note --text="User prefers terse output" --context=preferences --tags=ux
```

## Task Completion (Minimal)

```bash
lore-capture task \
  --project=myapp \
  --name="Add authentication" \
  --problem="No user login" \
  --solution="JWT with refresh tokens"
```

## Task Completion (Full)

```bash
lore-capture task \
  --project=myapp \
  --name="Add authentication" \
  --problem="No user login system" \
  --solution="JWT with refresh tokens and HTTP-only cookies" \
  --code="const token = jwt.sign({ userId }, secret, { expiresIn: '15m' })" \
  --discoveries="Refresh tokens prevent frequent re-auth,HTTP-only cookies safer than localStorage" \
  --deviations="Used HTTP-only cookies instead of planned localStorage" \
  --pattern="Separate access/refresh token flow with rotation" \
  --keywords=security,auth,jwt \
  --tech=typescript,jsonwebtoken,express \
  --difficulty="Medium - token rotation logic tricky"
```

## Knowledge Capture

```bash
# Project insight
lore-capture knowledge \
  --context=myapp \
  --text="Refresh tokens should rotate on each use to prevent replay attacks" \
  --type=project

# Conversation insight
lore-capture knowledge \
  --context=meeting-alice \
  --text="Prefers email updates over Slack" \
  --type=conversation
```

## Common Patterns

### During Development

```bash
# Capture problem discovered
lore-capture note --text="API returns 429 after 100 requests" --tags=bug,api

# After solving
lore-capture task \
  --project=myapp \
  --name="Fix rate limiting" \
  --problem="API returns 429 after 100 requests" \
  --solution="Implement exponential backoff with jitter"
```

### End of Session

```bash
# Capture learnings
lore-capture knowledge \
  --context=myapp \
  --text="Exponential backoff needs jitter to prevent thundering herd" \
  --type=project

# Quick reminder for next session
lore-capture note --text="Still need to add retry logic to batch processor" --tags=todo
```

## Output

All commands output JSON to stdout:

```json
{"success": true}
```

Diagnostics go to stderr:
```
✅ Event logged
```

## Error Handling

```bash
# Missing required field
lore-capture task --project=myapp
# {"success": false, "error": "Missing required fields: name, problem, solution"}

# Invalid type
lore-capture knowledge --context=foo --text="bar" --type=invalid
# {"success": false, "error": "Invalid type: invalid. Must be 'project' or 'conversation'"}
```

## Composability

```bash
# Check if event logged successfully
lore-capture note --text="Test" | jq -r '.success'

# Capture in script
if lore-capture note --text="Automated check passed" --tags=automation; then
  echo "Event logged"
fi

# View recent events
tail -10 ~/.local/share/lore/log.jsonl | jq .
```

## Tips

1. **Use quotes** for multi-word values: `--text="This is a note"`
2. **Comma-separate lists**: `--tags=one,two,three` (no spaces)
3. **Equal sign optional**: `--project=foo` or `--project foo` both work
4. **Check events**: `tail ~/.local/share/lore/log.jsonl | jq .`
5. **Terse output**: Only outputs what's actionable (`{"success": true}`)
