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

#### Recurring Lifecycle

Recurring items live in `recurring.md` and must be surfaced before they can be completed:

1. `flux recurring` — evaluates all items, copies due ones into `active.md`
2. Work from `active.md`
3. `flux done <id>` — completes the item, updates recurring metadata

Run `flux recurring` daily (manually or automated) to keep `active.md` current.

> **Note:** `flux cancel` does not update recurring metadata. Cancelled recurring items will resurface on their next schedule as if nothing happened. Use `flux done` for proper recurring lifecycle tracking.

#### Recurring Modes

Three modes, determined by which fields are present (evaluated in priority order):

**Day-of-week anchored** (highest priority — surfaces on a specific weekday):
```markdown
- [ ] Weekly review id::rec003 day::sunday
```
Valid days: `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`

**Date-anchored** (surfaces when approaching due date):
```markdown
- [ ] Tax prep id::rec002 due::2026-04-15 lead::45
```

**Cadence-based** (surfaces after enough time since last completion):
```markdown
- [ ] Weigh-in id::rec001 last::2026-01-01
```
Items with no `last::` are always surfaced (never done before).

| Field | Description | Default |
|-------|-------------|---------|
| `day::` | Day of week to surface (weekly cycle) | — |
| `due::` | Next due date (date-anchored) | — |
| `lead::` | Days before due to surface | 7 |
| `last::` | Last completion date (cadence-based) | — |

Items are organized under cadence sections in `recurring.md`: `## Daily`, `## Weekly`, `## Monthly`, `## Quarterly`, `## Yearly`.

On completion:
- Day-of-week: no metadata change, resurfaces next matching weekday
- Date-anchored: `due::` advances by cadence (monthly → +1 month, yearly → +1 year)
- Cadence-based: `last::` updates to today

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
