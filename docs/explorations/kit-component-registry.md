---
type: exploration
domain: technical
project: llmcli-tools
status: implemented
started: 2026-03-21
updated: 2026-03-26
tags: [kit, catalog, registry, skills, agents, components, cross-cutting, distribution]
---

# Kit: Cross-Cutting Component Registry

## Context

The Sable ecosystem has grown to include multiple projects that produce and consume composable components — skills, agents, wrappers, prompts, personas. These components are scattered across projects (Sable, Forge, Sigil, Dojo) with no centralized way to discover, distribute, or manage them.

IndyDevDan's "Library" metaskill demonstrated the core pattern: a YAML reference file pointing to private repos or local paths, with CLI commands to add, use, push, and sync. It's a **package manager without versioning** — "I just want the latest version."

**Kit** (`@voidwire/kit`) adapts this pattern for the `@voidwire` ecosystem, adding lightweight metadata for filtering and type-aware installation. A peer of Lore (knowledge), Flux (tasks), and Dojo (learning) in the llmcli-tools monorepo.

## The Problem

Components (skills, agents, wrappers, personas) are scattered across multiple projects with no unified way to:
- Know what exists across all projects
- Distribute components to devices (laptop, Mac Mini, cloud sandboxes)
- Install to the right location based on resource type
- Find the right component for a task ("what recon skills do I have?")
- Keep installed components in sync with their source repos

## How Kit Works

### The Catalog

The catalog is a **YAML file in its own git repo**. It stores references — pointers to where components live, not the components themselves.

```yaml
# kit-catalog.yaml
skills:
  - name: recon-methodology
    repo: github.com/rudy/forge
    path: skills/recon-methodology
    type: skill
    domain: [security, reconnaissance]
    tags: [recon, domain, methodology]

  - name: http-sweep
    repo: github.com/rudy/forge
    path: skills/http-sweep
    type: skill
    domain: [security, scanning]
    tags: [http, sweep, scan]

commands:
  - name: bash-function
    repo: github.com/rudy/dev-skills
    path: commands/bash-function.md
    type: command
    domain: [development]
    tags: [bash, utility]

agents:
  - name: ghost
    repo: github.com/rudy/forge
    path: agents/ghost.md
    type: agent
    domain: [security, reconnaissance]
    tags: [recon, investigation]

tools:
  - name: sigil-search-nuclei
    repo: github.com/rudy/sigil
    path: bin/sigil-search-nuclei
    type: tool
    domain: [security, detection]
    tags: [nuclei, cve, search]
```

The catalog repo is cloned onto every device. `kit sync` pulls the latest catalog + updates installed components from their source repos.

### Resource Types and Install Locations

Kit is type-aware — different resource types install to different locations:

| Type | Default install location | Notes |
|------|------------------------|-------|
| `skill` | `~/.claude/skills/<name>/` | Claude Code skill system |
| `command` | `~/.claude/commands/<name>.md` | Claude Code slash commands / prompts |
| `agent` | `~/.claude/agents/<name>.md` | Agent definitions, markdown format |
| `tool` | `~/.local/bin/` | Executable wrappers, helper tools |

### Install Scoping

By default, `kit use` installs globally. But components can be scoped to a specific directory for project-level isolation:

```bash
kit use http-sweep                          # global install
kit use http-sweep --dir ./                 # install to current project only
kit use http-sweep --dir ~/projects/pentest # install to specific project
```

Directory-scoped installs are important for limiting what Claude sees — fewer skills loaded means fewer tokens consumed and more focused behavior.

### Two Views: Available vs Installed

Kit tracks two things:
1. **Catalog** — everything registered (shared across devices via git)
2. **Installed** — what's on this device (local state in `~/.local/share/kit/state.yaml`)

```bash
kit list                    # all catalog entries, with installed indicator
kit list --installed        # only what's installed on this device
kit list --available        # only what's NOT installed
```

## CLI Interface

| Command | What it does |
|---------|-------------|
| `kit init` | Set up Kit — clone catalog repo, create XDG directories, initial state |
| `kit add <name>` | Register a new component reference in the catalog |
| `kit use <name>` | Install a component on this device (clone from source repo) |
| `kit use <name> --dir <path>` | Install to a specific directory (project-scoped) |
| `kit remove <name>` | Uninstall from this device |
| `kit remove <name> --from-catalog` | Deregister from catalog entirely |
| `kit list` | All catalog entries with installed indicator |
| `kit list --installed` | Only what's installed on this device |
| `kit list --type <type>` | Filter by resource type |
| `kit list --domain <domain>` | Filter by domain |
| `kit list --tags <tags>` | Filter by tags |
| `kit search <query>` | Keyword search across name, description, tags |
| `kit get <name>` | Full details for one entry |
| `kit push <name>` | Push local changes back to source repo |
| `kit sync` | Pull latest catalog + update all installed components |
| `kit check` | Validate all catalog pointers against source repos |
| `kit status` | Show Kit status and installed components |

### Workflow

**Build → Catalog → Distribute → Use** (Dan's pattern):

1. **Build** a skill/agent/command in its source project repo
2. **Catalog** with `kit add` — registers a reference in the catalog YAML, pushes to catalog repo
3. **Distribute** with `kit use` on any device — clones from source repo, installs to correct location
4. **Use** the component via Claude Code, Forge, or whatever consumes it
5. **Update** with `kit push` — pushes local changes back to source repo
6. **Sync** with `kit sync` — pulls latest catalog and updates installed components

## Consumers

- **Forge** — planner queries Kit for available security components; assembler selects from Kit to compose campaigns
- **Sable** — could query Kit for available development skills/agents
- **Humans** — "what skills do I have?" "what's installed on this device?"
- **Any project** that needs to find and use registered components

### Forge Integration

Forge consumes Kit as a library dependency:

```typescript
import { kit } from '@voidwire/kit';

// Planner queries Kit for available components
const reconSkills = await kit.list({ domain: 'security', tags: ['recon'] });

// Assembler selects specific component
const skill = await kit.get('recon-methodology');
```

CLI is for human use. Library API is for programmatic consumption.

## What Kit Does NOT Do

- **Semantic search** — keyword/tag filtering is enough for the expected catalog size
- **Validation tracking** — that's Forge's assembler job (Docker validation)
- **Version tracking** — "I just want the latest." Git handles history.
- **Enrichment** — no MITRE mappings, confidence scores, etc. That's arsenl territory if needed.
- **Build** — Kit doesn't create components. It registers and distributes them.

## Relationship to Other Systems

**Kit vs Lore:**
- Lore indexes *knowledge* — captures, sessions, explorations, personal data
- Kit indexes *components* — skills, agents, wrappers, prompts
- No overlap. A gotcha about a skill goes in Lore. The skill's reference goes in Kit.

**Kit vs Dan's Library:**
Kit IS Dan's Library pattern with two additions:
1. Resource type awareness (skills install differently than tools)
2. Lightweight metadata for filtering (domain, tags — so consumers can search)

**Kit vs Claude Code skill discovery:**
Claude Code scans `.claude/skills/` directories at startup. Kit manages *what gets into those directories* across devices. They complement each other — Kit distributes, Claude Code discovers at runtime.

## Open Questions

1. **Metadata source** — does Kit read metadata from the YAML only, or also parse component frontmatter on `kit add`?
2. **Catalog repo bootstrap** — how does a new user start? `kit init` clones a template repo?
3. **Multiple catalogs** — could you have team catalogs + personal catalog? Or one catalog per person?
4. **Agent install location** — where do persona definitions live on disk?

## References

- [[security-work-philosophy|Forge: AI-Native Security Practice]] — primary consumer of Kit
- IndyDevDan, "The Library Meta-Skill" — source pattern (YAML references, build/catalog/distribute/use workflow)
- Sable skill architecture — frontmatter conventions, skill discovery
- [[llmcli-tools/llm-core-architecture|LLM Core Architecture]] — monorepo patterns
