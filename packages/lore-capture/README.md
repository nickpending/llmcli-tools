# lore-capture - Knowledge Capture CLI

Type-safe event logging for tasks, knowledge insights, and notes. Replaces bash capture function sprawl with a unified TypeScript CLI.

## Philosophy

**The Problem:**
- Multiple bash capture functions (`lore_task_complete`, `lore_flux_capture`, `lore_note`)
- No type safety - models get poor error messages
- Unclear when to use which function
- Dead code (flux_capture unused)

**The Solution:**
- Single `lore-capture` CLI with three subcommands
- TypeScript type safety with clear validation errors
- Consistent interface across all capture types
- Model-friendly JSON output

## Installation

```bash
# From llcli-tools workspace root
cd packages/lore-capture
bun link

# Verify installation
lore-capture --help
```

## Usage

### Task Completion

Replaces `lore_task_complete` bash function.

**Required fields:**
- `--project` - Project name
- `--name` - Task name
- `--problem` - Problem solved
- `--solution` - Solution pattern

**Optional fields:**
- `--code` - Code snippet demonstrating solution
- `--discoveries` - Comma-separated learnings
- `--deviations` - How solution differs from plan
- `--pattern` - Reusable pattern extracted
- `--keywords` - Comma-separated search terms
- `--tech` - Technologies used
- `--difficulty` - Implementation difficulty notes

**Minimal example:**
```bash
lore-capture task \
  --project=myapp \
  --name="Add authentication" \
  --problem="No user login" \
  --solution="JWT with refresh tokens"
```

**Full example with all optional fields:**
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

### Knowledge Capture

Handles insights from `📁 CAPTURE [context]: text` format.

```bash
lore-capture knowledge \
  --context=lore \
  --text="Unified capture eliminates bash function sprawl" \
  --type=project

lore-capture knowledge \
  --context=grandma \
  --text="Need to research care facilities in LA area" \
  --type=conversation
```

**Fields:**
- `--context` - Topic/context name (required)
- `--text` - The insight/capture text (required)
- `--type` - Either "project" or "conversation" (required)

### Quick Notes

Replaces `lore_note` bash function.

```bash
lore-capture note \
  --text="Remember to test edge cases with malformed CSV" \
  --tags=testing,reminder \
  --context=imports

lore-capture note \
  --text="Model prefers structured questions via AskUserQuestion"
```

**Fields:**
- `--text` - Note content (required)
- `--tags` - Comma-separated tags (optional)
- `--context` - Context/topic (optional)

## Output Format

All commands output terse JSON for composability:

**Success:**
```json
{ "success": true }
```

Diagnostic to stderr: `✅ Event logged`

**Errors:**
```json
{ "success": false, "error": "Missing required fields: project, name" }
```

Diagnostic to stderr: `❌ Missing required fields: project, name`

## Architecture

### Event Types

All events share this structure:

```typescript
{
  event: "captured",
  type: "task" | "knowledge" | "note",
  timestamp: "2025-11-20T22:30:00Z",
  data: { /* type-specific fields */ }
}
```

### Storage

Events append to `~/.local/share/lore/log.jsonl` (XDG-compliant).

### Integration

Events are written to `~/.local/share/lore/log.jsonl` and can be indexed by `lore-index-events` for search.

## Migration from Bash

| Old Bash Function | New TypeScript Command |
|-------------------|------------------------|
| `lore_task_complete "$project" "$task" "$problem" "$solution" ...` | `lore-capture task --project=... --name=... --problem=... --solution=...` |
| `lore_note "$content" "$tags" "$context"` | `lore-capture note --text=... --tags=... --context=...` |
| `lore_flux_capture` | **Removed** (dead code) |

**Deprecation Timeline:**
- Bash functions show warnings pointing to `lore-capture`
- Keep bash functions for backward compatibility during migration
- Remove bash functions after all integrations updated

## Development

```bash
# Run locally
cd packages/lore-capture
bun run lore-capture.ts task --help

# Test
bun test

# Link globally for testing
bun link
```

## See Also

- [CLI Development Guide](../../CLI-DEVELOPMENT-GUIDE.md) - Development patterns and principles
