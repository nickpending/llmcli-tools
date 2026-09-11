---
type: architecture
subtype: decisions
project: "llmcli-tools"
status: active
created: "2026-06-08"
updated: "2026-09-11"
tags: [architecture, decisions]
---

# Decisions

Architectural decisions and their rationale. Most recent first.

## llm-summarize: tighten signal-type definitions with IS/IS-NOT examples

**Context:** The insights-extraction prompt's `signal_types` block (`buildInsightsPrompt` in `packages/llm-summarize/index.ts`) defined each capture type (gotcha, decision, discovery, pattern, preference, style, term, teaching) in a single loose line, too weak to reliably separate a real signal from a restatement or one-off event.
**Choice:** Rewrote each signal type's definition with paired IS/IS-NOT examples (and for `pattern`, an explicit requirement to name the recurring class of situation), without changing the eight signal types themselves or the extraction contract's output shape.
**Why:** Raises the bar for what's capture-worthy before it reaches Lore — fewer ambiguous or restated captures entering the knowledge base.

## Build: declare `typescript` devDependency wherever `tsc` runs

**Context:** Typecheck scripts resolved `tsc` from PATH — works only where TypeScript happens to be installed globally, exits 127 elsewhere. Under `verify.sh` running with `set -e` and no failure accumulator, that 127 aborts the whole run silently, so every check after it never happens.
**Choice:** Every package whose typecheck script runs `tsc` declares `typescript` as an explicit devDependency (`dojo`, `llm`, `lore`, `sable-eval`; commit `9f805a4`), per Bootstrap's conformance contract, property 9.
**Why:** Makes the toolchain dependency explicit and workspace-installable instead of relying on a global install — `verify.sh` runs deterministically regardless of the host's global toolchain.

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
