---
type: architecture
subtype: decisions
project: "llmcli-tools"
status: active
created: "2026-06-08"
updated: "2026-06-08"
tags: [architecture, decisions]
---

# Decisions

Architectural decisions and their rationale. Most recent first.

## kit: replace smol-toml with Bun.TOML.parse

**Context:** kit parsed its TOML config via the `smol-toml` dependency.
**Choice:** Drop `smol-toml`, use the runtime-native `Bun.TOML.parse` (commit `4f7063d`).
**Why:** Bun ships TOML parsing natively — removing the dep aligns with the monorepo's minimal-dependency principle and cuts install surface.

## llm-core extracted to a published npm package

**Context:** `llm-core` lived as a workspace package inside the monorepo; the knowledge tools (llm, llm-summarize, lore, sable-eval) imported it locally.
**Choice:** Remove `llm-core` from the workspace and consume it as the published `@voidwire/llm-core` npm package (commit `22524d5`), now pinned at `^0.6.0` (`ab7a39b`).
**Why:** Lets `llm-core` version independently and be reused outside this repo. The four consumers now share a versioned external contract instead of a local path, with `healthCheck()` added to the published surface (`72f27f3`).
