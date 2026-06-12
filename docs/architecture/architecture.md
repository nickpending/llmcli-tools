---
type: architecture
subtype: overview
project: "llmcli-tools"
status: active
created: "2026-06-08"
updated: "2026-06-08"
tags: [architecture]
---

# llmcli-tools Architecture

> A Bun/TypeScript monorepo of standalone CLI tools published under the `@voidwire` npm scope. Each package is self-contained, dual-use (library export + CLI wrapper), and emits JSON to stdout for LLM-agent consumption. The intent: offload simple, deterministic tasks to scripts so LLMs spend tokens on judgment, not bookkeeping.

## Principles

- **Simple** — manual argument parsing, no CLI frameworks, minimal dependencies. Most tools are self-contained.
- **Deterministic** — same input → same output, always JSON.
- **Composable** — pipes to `jq`, `grep`, other Unix tools.
- **Complete** — production-ready tools, not scaffolds.
- **Type-safe** — TypeScript strict mode throughout, Bun runtime.
- **Dual-use** — every tool ships a library export (`index.ts`) plus a CLI wrapper (`cli.ts`), so it can be imported or shell-invoked.

## Components

| Component | Purpose | Detail |
|-----------|---------|--------|
| argus-send | Send events to the Argus observability platform | — |
| dojo | Coaching-system state-management CLI (ships skills) | — |
| expertise-update | Sync Lore insights into `PROJECT_EXPERTISE.toml` | — |
| flux | Task management CLI for Obsidian-based workflows | — |
| gitignore-check | Gitignore compliance checker with OS/language auto-detection | — |
| kit | Cross-cutting component registry for the `@voidwire` ecosystem | — |
| language-detect | Evidence-based programming-language detector for projects | — |
| llm | LLM tooling CLI — embed-server lifecycle and utility subcommands | — |
| llm-notify | Queue notifications for Claude awareness from external systems | — |
| llm-summarize | Structured session-insight extraction for knowledge systems | — |
| lore | Unified knowledge CLI — search, list, capture indexed knowledge | — |
| sable-eval | Rubric-based artifact scoring for SABLE agents | — |
| visual-image | Generate AI images via Replicate (flux) and Google (Gemini) | — |
| visual-mermaid | Render Mermaid diagrams to PNG/SVG with terminal-noir theming | — |

> `registry/` exists as an empty stub (no `package.json`, empty `lib/`) and is not a live component.

## Key Decisions

See [decisions.md](decisions.md) for the full decision log.

## Boundaries

See [boundaries.md](boundaries.md) for interface contracts.
