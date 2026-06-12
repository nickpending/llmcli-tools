---
type: architecture
subtype: components
project: "llmcli-tools"
status: active
created: "2026-06-08"
updated: "2026-06-12"
tags: [architecture, components]
---

# Components

Registry of all system components. Each entry links to a detail doc when the component has enough substance to warrant one. Every package follows the same shape: `index.ts` (library export), `cli.ts` (CLI wrapper), `package.json` under the `@voidwire` scope.

## argus-send

**Purpose:** Send events to the Argus observability platform.
**Key files:** `packages/argus-send/{index.ts,cli.ts}`
**Connections:** External — Argus platform. Standalone, no internal package deps.

## dojo

**Purpose:** Coaching-system state-management CLI; also ships agent skills.
**Key files:** `packages/dojo/{index.ts,cli.ts,lib/}`, `packages/dojo/skills/` (learn, lesson-planner)
**Connections:** Standalone. Skills consumed by the agent harness, not other packages.

## expertise-update

**Purpose:** Sync Lore insights into a project's `PROJECT_EXPERTISE.toml`.
**Key files:** `packages/expertise-update/{index.ts,cli.ts}`
**Connections:** Hard `workspace:*` dependency on `@voidwire/lore` (imports Lore's library); writes `PROJECT_EXPERTISE.toml`.

## flux

**Purpose:** Task management CLI for Obsidian-based workflows (global + project-scoped todos).
**Key files:** `packages/flux/{index.ts,cli.ts,lib/}`
**Connections:** Reads/writes Obsidian vault. Standalone.

## gitignore-check

**Purpose:** Gitignore compliance checker with OS and language auto-detection.
**Key files:** `packages/gitignore-check/{index.ts,cli.ts}`, `packages/gitignore-check/templates/`
**Connections:** Hard `workspace:*` dependency on `@voidwire/language-detect` — imports `detectLanguages` directly (no subprocess) for language auto-detection. Pulls patterns from bundled GitHub templates.

## kit

**Purpose:** Cross-cutting component registry — manages skills, commands, agents, tools across the `@voidwire` ecosystem and devices.
**Key files:** `packages/kit/{index.ts,cli.ts,lib/}` (`lib/config.ts`, `lib/core.ts`), `packages/kit/__tests__/`
**Connections:** Reads/writes component catalog. Parses TOML config via `Bun.TOML.parse` (no external TOML dep).

## language-detect

**Purpose:** Fast, evidence-based programming-language detector for projects.
**Key files:** `packages/language-detect/{index.ts,cli.ts}`
**Connections:** Consumed by gitignore-check via a hard `workspace:*` dependency (direct library import of `detectLanguages`). Otherwise standalone.

## llm

**Purpose:** LLM tooling CLI — embed-server lifecycle management and utility subcommands.
**Key files:** `packages/llm/{index.ts,cli.ts,lib/}`, `packages/llm/tests/`
**Connections:** Depends on `@voidwire/llm-core` (npm). Manages the embed server other knowledge tools rely on.

## llm-notify

**Purpose:** Queue notifications for Claude awareness from external systems.
**Key files:** `packages/llm-notify/{index.ts,cli.ts}`
**Connections:** Standalone. Writes a notification queue read by the agent harness.

## llm-summarize

**Purpose:** Structured session-insight extraction for knowledge systems.
**Key files:** `packages/llm-summarize/{index.ts,cli.ts}`, `packages/llm-summarize/tests/`
**Connections:** Depends on `@voidwire/llm-core` (npm). Feeds extracted insights into knowledge capture (Lore).

## lore

**Purpose:** Unified knowledge CLI — search, list, and capture indexed knowledge.
**Key files:** `packages/lore/{index.ts,cli.ts,lib/}`, `packages/lore/tests/`
**Connections:** Depends on `@voidwire/llm-core` (npm) for embeddings. Source of insights for expertise-update.

## sable-eval

**Purpose:** Rubric-based artifact scoring tool for SABLE agents.
**Key files:** `packages/sable-eval/{index.ts,cli.ts,lib/}`, `packages/sable-eval/tests/`
**Connections:** Depends on `@voidwire/llm-core` (npm). Scores agent artifacts.

## visual-image

**Purpose:** Generate AI images via Replicate (flux) and Google (Gemini).
**Key files:** `packages/visual-image/{index.ts,cli.ts}`, `config.example.toml`
**Connections:** External — Replicate and Google Gemini APIs. Config-driven.

## visual-mermaid

**Purpose:** Render Mermaid diagrams to PNG/SVG with terminal-noir theming.
**Key files:** `packages/visual-mermaid/{index.ts,cli.ts}`, `config.example.toml`
**Connections:** Standalone. Renders Mermaid source to image files.
