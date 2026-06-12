---
type: architecture
subtype: boundaries
project: "llmcli-tools"
status: active
created: "2026-06-08"
updated: "2026-06-12"
tags: [architecture, boundaries]
---

# Boundaries

Interface contracts between components and external systems.

## @voidwire/llm-core (npm)

**Between:** llm, llm-summarize, lore, sable-eval ↔ External (`@voidwire/llm-core` npm package, pinned `^0.6.0`)
**Contract:** Consumers import embedding and `healthCheck()` functionality from the published package. The embed server's lifecycle is managed by the `llm` CLI.
**Constraints:** Breaking changes ship as a new `llm-core` major version; all four consumers must move together. The version pin is the contract — bumps are deliberate (`chore: bump @voidwire/llm-core`).

## CLI JSON-stdout contract

**Between:** Every `@voidwire/*` CLI ↔ Consumers (LLM agents, shell pipelines, `jq`)
**Contract:** Each tool emits structured JSON to stdout for the same input, deterministically. Library callers get the same data via the package's `index.ts` export.
**Constraints:** Output shape is the public API — changing JSON keys/structure breaks downstream parsing. Dual-use means `index.ts` and `cli.ts` must stay in sync.

## Internal workspace library imports

**Between:** gitignore-check → language-detect; expertise-update → lore (both `workspace:*`)
**Contract:** Consumers import the producer's library export directly (e.g. gitignore-check imports `detectLanguages` from `@voidwire/language-detect` — no subprocess). The producer's `index.ts` export surface is the contract.
**Constraints:** These are the only two internal package-to-package deps; every other package is standalone. Changing a producer's exported function signatures breaks its in-repo consumer — keep `index.ts` exports stable or update both sides together.

## argus-send → Argus platform

**Between:** argus-send ↔ External (Argus observability platform)
**Contract:** Sends observability events to Argus over its ingest interface.
**Constraints:** Event schema and transport are dictated by the Argus platform, not this repo.
