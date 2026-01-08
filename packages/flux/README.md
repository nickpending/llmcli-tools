# @voidwire/flux

Simple task management CLI with markdown-backed storage.

## Installation

```bash
pnpm install
pnpm build
```

Link globally:
```bash
pnpm link --global
```

## Configuration

Create `~/.config/flux/config.toml`:

```toml
[paths]
data_dir = "~/obsidian/flux"
projects_dir = "~/obsidian/projects"

[behavior]
archive_after_days = 7
```

Projects are auto-discovered from `projects_dir`. Any subdirectory is a valid project. Typos fail because the directory doesn't exist.

## Commands

### Add Task

```bash
flux add "task description"              # Add to later.md
flux add "task" -p myproject             # Add to project backlog
flux add "task" -t idea                  # Add as idea type
flux add "urgent task" --urgent          # Add to later.md AND active.md
```

Types: `todo` (default), `idea`, `bug`

### Complete/Cancel

```bash
flux done <id-or-text>                   # Mark complete, move to daily
flux cancel <id-or-text>                 # Cancel, move to daily
```

### Activate/Defer

```bash
flux activate <id-or-text>               # Move to active.md (Today)
flux activate <id-or-text> --week        # Move to active.md (This Week)
flux defer <id-or-text>                  # Return to backlog
```

### List

```bash
flux list                                # All tasks
flux list -p myproject                   # Filter by project
flux list -t bug                         # Filter by type
```

### Recurring

```bash
flux recurring --dry-run                 # Preview what would surface
flux recurring                           # Surface due recurring tasks
```

Recurring items support two modes:

**Cadence-based** (time since last done):
```markdown
- [ ] Weigh-in id::rec001 last::2026-01-01
```

**Date-anchored** (approaching due date):
```markdown
- [ ] Tax prep id::rec002 due::2026-04-15 lead::45
```

| Field | Description | Default |
|-------|-------------|---------|
| `last::` | Last completion date (cadence-based) | — |
| `due::` | Next due date (date-anchored) | — |
| `lead::` | Days before due to surface | 7 |

On completion:
- Cadence-based: `last::` updates to today
- Date-anchored: `due::` advances by cadence (yearly → +1 year)

### Maintenance

```bash
flux lint                                # Check for format issues
flux lint --fix                          # Auto-fix issues
flux archive --dry-run                   # Preview archival
flux archive                             # Archive old completed items
```

## File Structure

```
data_dir/
  active.md      # Current work (Today, This Week)
  later.md       # Backlog (Ideas, Todos)
  recurring.md   # Recurring tasks by cadence
  daily/         # Daily logs (YYYY-MM-DD.md)
  archive/       # Monthly archives (YYYY-MM.md)

projects_dir/
  {project}/
    later.md     # Project backlog
    completed.md # Project changelog
```

## Item Format

```markdown
- [ ] description #tag id::abc123 captured:: 2026-01-07 08:00
- todo:: description id::abc123 captured:: 2026-01-07 08:00
- idea:: description id::abc123 captured:: 2026-01-07 08:00
- bug:: description id::abc123 captured:: 2026-01-07 08:00
```

Checkbox form for active tasks, type-prefix form for backlogs.

## Output

All commands output JSON:

```json
{
  "success": true,
  "id": "abc123",
  "destination": "/path/to/file.md",
  "item": { ... }
}
```

Errors exit non-zero with JSON error object.
