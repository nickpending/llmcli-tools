---
type: architecture
subtype: decisions
project: "llmcli-tools"
status: active
created: "2026-06-08"
updated: "2026-08-23"
tags: [architecture, decisions]
---

# Decisions

Architectural decisions and their rationale. Most recent first.

## kit: catalog as a pointer YAML in its own git repo, not vendored components

**Context:** Kit distributes skills/agents/commands/tools across devices and projects. The design (`docs/explorations/kit-component-registry.md`, adapted from IndyDevDan's "Library" metaskill) had to choose between vendoring component content into the catalog or storing references.
**Choice:** The catalog is a YAML file (`kit-catalog.yaml`) living in its own git repo, parsed with the `js-yaml` dependency (`packages/kit/lib/catalog.ts`). It stores pointers (`repo`, `path`, `type`, `domain`, `tags`) to where components live, not the components themselves. Local Kit config (catalog repo URL, path overrides) is separate — TOML at `~/.config/kit/config.toml`, parsed via `Bun.TOML.parse` (no dep). Installed-component state is tracked device-locally in `~/.local/share/kit/state.yaml`, distinct from the catalog.
**Why:** A package-manager-without-versioning model ("I just want the latest") — git handles history, the catalog stays lightweight and diffable, and `kit sync` can pull the latest catalog plus update installed components without re-vendoring content. Resource type (`skill`/`command`/`tool`/`agent`) drives install location so one CLI handles heterogeneous component kinds.

## kit: replace smol-toml with Bun.TOML.parse

**Context:** kit parsed its TOML config via the `smol-toml` dependency.
**Choice:** Drop `smol-toml`, use the runtime-native `Bun.TOML.parse` (commit `4f7063d`).
**Why:** Bun ships TOML parsing natively — removing the dep aligns with the monorepo's minimal-dependency principle and cuts install surface.

## llm-core extracted to a published npm package

**Context:** `llm-core` lived as a workspace package inside the monorepo; the knowledge tools (llm, llm-summarize, lore, sable-eval) imported it locally.
**Choice:** Remove `llm-core` from the workspace and consume it as the published `@voidwire/llm-core` npm package (commit `22524d5`), now pinned at `^0.6.0` (`ab7a39b`).
**Why:** Lets `llm-core` version independently and be reused outside this repo. The four consumers now share a versioned external contract instead of a local path, with `healthCheck()` added to the published surface (`72f27f3`).
