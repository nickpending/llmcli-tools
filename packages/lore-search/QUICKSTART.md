# lore-search Quickstart

## Basic Search

```bash
# Search all indexed content
lore-search "authentication"

# Search specific source
lore-search blogs "typescript"
lore-search commits "refactor"
```

## List Sources

```bash
# See what's indexed
lore-search --sources
```

Output:
```json
{
  "success": true,
  "sources": [
    { "source": "blogs", "count": 42 },
    { "source": "commits", "count": 1337 }
  ]
}
```

## Pipe to jq

```bash
# Get just the titles
lore-search "error" | jq -r '.results[].title'

# Get first result content
lore-search "bug" | jq -r '.results[0].content'

# Check if any results
lore-search "rare" | jq '.count > 0'
```

## Limit Results

```bash
# Top 5 results only
lore-search --limit 5 "important"
```

## FTS5 Query Examples

```bash
# Exact phrase
lore-search '"error handling"'

# Either term
lore-search "bug OR error"

# Exclude term
lore-search "test NOT mock"

# Prefix match
lore-search "auth*"
```

## Common Patterns

```bash
# Find recent work on a topic
lore-search commits "authentication" | jq '.results[:5]'

# Search blog posts about a technology
lore-search blogs "typescript strict mode"

# Check if topic is indexed
lore-search --sources | jq '.sources[] | select(.source == "blogs")'
```
