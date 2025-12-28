# expertise-update

Sync Lore insights into PROJECT_EXPERTISE.toml.

## Philosophy

- **Additive only** - Merges new insights, never removes existing ones
- **Deduplication** - Prevents duplicate insights by content comparison
- **Silent on missing** - No error if expertise file doesn't exist
- **Composable** - JSON output pipes to jq and other tools

## Installation

```bash
cd packages/expertise-update
bun link
```

## Usage

```bash
expertise-update --project <name> --root <path>
```

### Arguments

| Flag | Description |
|------|-------------|
| `--project, -p` | Project name for Lore queries (required) |
| `--root, -r` | Project root directory path (required) |
| `-h, --help` | Show help |

### Examples

```bash
# Sync argus project insights
expertise-update --project argus --root ~/development/projects/argus

# Short form
expertise-update -p momentum -r ~/development/projects/momentum
```

## Output

```json
{
  "updated": true,
  "insights_added": 5,
  "total_insights": 12
}
```

No changes needed:
```json
{
  "updated": false,
  "insights_added": 0,
  "total_insights": 12
}
```

## How It Works

1. Queries Lore for project-specific captures:
   - `gotcha <project>` → gotchas
   - `decision <project>` → decisions
   - `learning <project>` → learnings

2. Reads `.workflow/artifacts/PROJECT_EXPERTISE.toml`

3. Merges into `[insights]` section (additive, deduplicated)

4. Writes updated TOML

## Target File

```
<project-root>/.workflow/artifacts/PROJECT_EXPERTISE.toml
```

### Expected Structure

```toml
[meta]
project = "argus"
updated = "2025-01-15"

[insights]
gotchas = [
  "SQLite WAL mode requires careful lock handling",
]
decisions = [
  "Use FTS5 for full-text search",
]
learnings = [
  "Rust's ? operator simplifies error propagation",
]
```

## Library Usage

```typescript
import { updateExpertise } from "expertise-update";

const result = await updateExpertise("argus", "~/development/projects/argus");

if (result.updated) {
  console.log(`Added ${result.insights_added} insights`);
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (including no updates needed) |
| 1 | Validation error (missing args) |
| 2 | Runtime error (TOML parse failure) |
