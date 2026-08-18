---
type: exploration
domain: technical
status: draft
started: 2026-02-02
updated: 2026-02-18
tags: [exploration]
---
# .ai/usage.md Convention for Agent-Oriented CLI Documentation

**Date:** 2026-02-02
**Status:** Proposed
**Impact:** Convention for all llmcli-tools packages; potentially broader adoption

## Problem

Traditional `--help` output is designed for humans with context:

```
Usage: flux [command] [options]

Commands:
  add      Add a new item
  list     List items
  done     Mark item complete

Options:
  -p, --project <name>   Project scope
  -h, --help             Show help
```

Agents see this and infer incorrectly. They lack:
- **When to use** — what triggers this tool vs alternatives
- **Mental model** — what "project scope" means in practice
- **Patterns** — common combinations and workflows
- **Output format** — what to expect and parse

Result: agents misuse tools, guess at flags, and produce wrong invocations.

## Observation

Sable skills already solve this. They're markdown documents that explain *when*, *why*, and *how* — not just *what flags exist*. The skill format is agent-oriented documentation.

The insight: **every CLI should ship this style of help**.

## Solution: `.ai/usage.md` Convention

Each CLI includes a `.ai/` directory with agent-oriented documentation:

```
project/
├── .ai/
│   └── usage.md      # skill-format doc for AI consumption
├── src/
├── package.json
└── README.md
```

### Why `.ai/` Directory

- **Namespaced** — no collision with existing conventions (AGENT.md could mean "about agents" vs "for agents")
- **Extensible** — room to grow:
  ```
  .ai/
    usage.md        # how to use (skill format)
    schema.json     # structured capabilities (optional)
    examples/       # extended examples (optional)
  ```
- **Discoverable** — agents can check for `.ai/usage.md` as a standard
- **Hidden** — dot-prefix keeps it out of the way for humans browsing

### usage.md Format

Follows the established Sable skill structure:

```markdown
# <tool-name>

<One-line description>

**CLI:** `<command>` (how to invoke)

---

## When to Use

| Trigger | Command |
|---------|---------|
| "add a task" | `flux add "..."` |
| "what's active" | `flux list` |

## Key Concepts

- **Scope**: Without `-p`, operates globally. With `-p`, scopes to project.
- **Types**: todo (default), bug, idea
- **States**: active (Today/This Week) vs backlog

## Common Patterns

```bash
# Daily check
flux list

# Add urgent project bug
flux add "fix auth crash" -p momentum -t bug --urgent
```

## Output Format

JSON with `items[]` array and `summary` object.
```

### CLI Flag (Optional)

```bash
flux --ai-help
# → cats .ai/usage.md to stdout
```

The flag is convenience — agents can also just `cat .ai/usage.md` directly.

## Connection to Agent-Native Architecture

This implements the **dynamic capability discovery** pattern from the "Agents as first-class citizens" article:

> "Dynamic capability discovery allows agents to adapt to evolving APIs without requiring code updates."

Instead of agents inferring from terse `--help`, tools describe themselves fully. The `.ai/usage.md` *is* the capability advertisement.

## Implementation Plan

1. Add `.ai/usage.md` to each llmcli-tools package (flux, lore, prismis-cli, etc.)
2. Content mirrors existing Sable skill files (they're already written)
3. Optional: add `--ai-help` flag that emits the file
4. Document the convention in llmcli-tools README

## Extension Points

Future additions to `.ai/`:

| File | Purpose |
|------|---------|
| `usage.md` | How to use (skill format) |
| `schema.json` | JSON Schema for structured capability description |
| `examples/` | Extended usage examples by domain |
| `prompts/` | System prompts optimized for this tool |

## Open Questions

1. Should `--ai-help` be a standard flag name across all tools?
2. Should there be a registry/discovery mechanism for `.ai/` directories?
3. How to version the format as it evolves?

## References

- Sable skill format: `{SABLE_HOME}/.claude/skills/`
- "Agents as first-class citizens" article (Prismis, 2026-02-02)
- llmcli-tools philosophy: deterministic, composable, JSON output
