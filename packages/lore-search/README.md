# lore-search

Knowledge search CLI - Query Lore's FTS5 database for indexed content.

## Philosophy

- **Fast** - SQLite FTS5 for sub-second queries across all indexed content
- **Composable** - JSON output pipes to jq, grep, other Unix tools
- **Simple** - Manual arg parsing, zero framework dependencies

## Installation

```bash
cd llmcli-tools
./install.sh lore-search
```

Or use directly with Bun:

```bash
bun run lore-search.ts <query>
```

## Usage

```bash
lore-search <query>                    # Search all sources
lore-search <source> <query>           # Search specific source
lore-search --sources                  # List indexed sources
```

### Options

- `--limit <n>` - Maximum results (default: 20)
- `--sources` - List indexed sources with counts
- `--help, -h` - Show help

## Output Format

All output is JSON with `success` boolean:

```json
{
  "success": true,
  "results": [
    {
      "source": "blogs",
      "title": "TypeScript Best Practices",
      "content": "→TypeScript← provides type safety...",
      "metadata": "{\"date\": \"2024-01-15\"}",
      "rank": -0.73
    }
  ],
  "count": 1
}
```

### Error Output

```json
{
  "success": false,
  "error": "Database not found: ~/.local/share/lore/lore.db. Run lore-db-init first."
}
```

## FTS5 Query Syntax

- `word` - Match word anywhere
- `"exact phrase"` - Match exact phrase
- `word1 word2` - Match both (implicit AND)
- `word1 OR word2` - Match either
- `word1 NOT word2` - Exclude word2
- `word*` - Prefix match

## Integration

Requires Lore database initialized:

```bash
lore-db-init                           # Create database
lore-index-blogs                       # Index blogs (or other indexers)
lore-search blogs "typescript"         # Search
```

## Architecture

```
lore-search/
├── lore-search.ts     # CLI entry point
├── lib/
│   └── search.ts      # SQLite FTS5 queries
├── package.json
├── tsconfig.json
├── README.md
└── QUICKSTART.md
```

## Exit Codes

- `0` - Success
- `1` - Validation error (missing args)
- `2` - Database error
