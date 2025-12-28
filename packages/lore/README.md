# lore

Unified knowledge CLI — search, list, and capture your indexed knowledge fabric.

## Philosophy

- **Unified** — Single entry point for all knowledge operations
- **Library-first** — Import functions directly, CLI is a thin wrapper
- **Composable** — JSON output pipes to jq, grep, other Unix tools
- **Zero duplication** — Re-exports from lore-search and lore-capture

## Installation

```bash
cd llmcli-tools/packages/lore
bun link
```

## CLI Usage

```bash
lore search <query>                    # Search all sources
lore search <source> <query>           # Search specific source
lore search --sources                  # List indexed sources

lore list <domain>                     # List domain entries
lore list --domains                    # List available domains

lore capture task|knowledge|note       # Capture knowledge
```

### Search Options

- `--limit <n>` — Maximum results (default: 20)
- `--since <date>` — Filter by date (today, yesterday, this-week, YYYY-MM-DD)
- `--sources` — List indexed sources with counts

### Passthrough Sources

Some sources query external services rather than the local index:

```bash
lore search prismis "kubernetes security"    # Semantic search via prismis
```

| Source | Description | Requires |
|--------|-------------|----------|
| `prismis` | Semantic search across saved articles | prismis-daemon running |

Passthrough sources appear in `lore search --sources` with `type: "passthrough"`.

### List Options

- `--limit <n>` — Maximum entries
- `--format <fmt>` — Output format: json (default), jsonl, human
- `--domains` — List available domains

### Capture Types

```bash
# Task completion
lore capture task --project=myproject --name="Task name" \
  --problem="What was solved" --solution="How it was solved"

# Knowledge insight
lore capture knowledge --context=myproject \
  --text="Insight learned" --type=learning

# Quick note
lore capture note --text="Remember this" --tags=tag1,tag2
```

## Library Usage

The real power is programmatic access:

```typescript
import {
  // Search (from lore-search)
  search,
  listSources,
  type SearchResult,
  type SearchOptions,

  // List (local)
  list,
  listDomains,
  DOMAINS,
  type Domain,
  type ListResult,

  // Capture (from lore-capture)
  captureKnowledge,
  captureTask,
  captureNote,
  type KnowledgeInput,
  type TaskInput,
  type NoteInput,
} from "lore";

// Search
const results = search("authentication", { limit: 10 });

// List
const devProjects = list("development");

// Capture
captureKnowledge({
  context: "myproject",
  text: "Important insight",
  type: "learning",
});
```

## Domains

15 domains available for `lore list`:

| Domain | Description |
|--------|-------------|
| development | Development projects |
| tasks | Flux tasks and ideas |
| events | Events by project |
| blogs | Blog posts |
| commits | Git commits |
| explorations | Project explorations |
| readmes | Project READMEs |
| obsidian | Obsidian vault notes |
| captures | Quick captures |
| books | Books read |
| movies | Movies watched |
| podcasts | Podcast subscriptions |
| interests | Personal interests |
| people | People and relationships |
| habits | Habit tracking |

## Knowledge Types

For `lore capture knowledge --type`:

- `decision` — Architectural or design decisions
- `learning` — Something learned during work
- `gotcha` — Pitfall or gotcha to remember
- `preference` — User preference discovered
- `project` — Project-level insight
- `conversation` — Insight from conversation
- `knowledge` — General knowledge

## Architecture

```
lore/
├── index.ts              # Re-exports from lib/
├── cli.ts                # Unified CLI (search|list|capture)
├── lib/
│   ├── search.ts         # FTS5 search (SQLite)
│   ├── list.ts           # Domain listing
│   └── capture.ts        # JSONL capture
└── package.json          # Zero dependencies
```

Self-contained package. No workspace dependencies. Ready for npm publish.

## Data Locations

- `~/.local/share/lore/lore.db` — SQLite FTS5 database (search, list)
- `~/.local/share/lore/log.jsonl` — Capture event log

## Exit Codes

- `0` — Success
- `1` — Validation error (missing args, invalid domain)
- `2` — Runtime error (database not found)
