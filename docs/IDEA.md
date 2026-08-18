---
type: project
domain: technical
status: active
started: 2025-12-04
---
# llmcli-tools - Core Idea

## The Problem

**What specific problem does this solve?**

LLMs waste tokens on repetitive, deterministic tasks that don't require intelligence. Checking gitignore compliance, detecting project languages, capturing structured knowledge, summarizing text - these are mechanical operations that burn computation and context on work a simple script handles instantly.

**Who has this problem?**

Developers using LLMs as coding assistants or building LLM-powered workflows. Anyone who notices their AI spending cycles on "let me check if your .gitignore includes .env patterns" instead of actually solving problems.

**How do they solve it today?**

- Bash function sprawl that grows organically and becomes unmaintainable
- Letting the LLM do it anyway (wasteful)
- Ad-hoc scripts without consistent interfaces
- Manual checks that should be automated

## The Solution

**Core Value Proposition**

Zero-dependency TypeScript CLI tools that offload mechanical tasks from LLMs, outputting deterministic JSON that's instantly consumable by both humans and machines.

**Key Differentiators**

- **Zero dependencies** - Each tool is self-contained (~300-400 lines), fast startup, no npm ecosystem bloat
- **Deterministic JSON output** - Same input always produces same output, perfect for automation
- **Composable Unix-style** - Tools pipe together, integrate with jq, work in any workflow
- **LLM-native design** - Error messages, output formats, and interfaces designed for model consumption

## System Flow (Initial Sketch)

> **Note**: This is a preliminary sketch of system operation. The actual workflow will evolve significantly during development.

1. LLM or user invokes a tool with arguments
2. Tool parses args manually (no framework), validates input
3. Tool performs its deterministic operation
4. Tool outputs JSON to stdout
5. Output pipes to next tool, jq, or observability system

## User Experience Vision

**Primary User Journey**

1. Developer identifies a repetitive task burning LLM tokens
2. Uses existing tool or builds new one following the pattern
3. Integrates into workflow - LLM calls tool, uses output

**Core User Workflows**

- **Security compliance**: `gitignore-check . | argus-send --stdin` - verify and log compliance
- **Knowledge capture**: `lore-capture task --project foo --problem "X" --solution "Y"` - structured logging
- **Content processing**: `echo "text" | llm-summarize` - cheap LLM summarization for pipelines
- **Knowledge retrieval**: `lore-search "query"` - instant FTS5 search across indexed content

**Success Criteria**

- Tools complete in milliseconds (not seconds)
- LLMs can use output without parsing complexity
- New tools follow the pattern without reference docs
- Zero runtime errors in production use

## MVP Definition

**What is the absolute minimum viable version?**

A collection of standalone CLI tools that handle common LLM workflow friction points, each independently useful.

**MVP Scope**

- gitignore-check - Security compliance verification
- language-detect - Project language detection
- argus-send - Observability event dispatch
- lore-capture - Structured knowledge logging

**MVP Constraints**

- No shared libraries between tools (each is fully self-contained)
- Manual arg parsing only (no commander.js, no yargs)
- TypeScript strict mode, but runtime is Bun only
- JSON output only, no alternative formats

**Post-MVP Evolution**

- llm-summarize - LLM-powered text summarization (added)
- lore-search - FTS5 knowledge search (added)
- Additional tools as friction points emerge

## Features Status

**Status Legend:**

- 📋 **Planned** - Feature defined and ready for iteration planning
- 🔄 **In Progress** - Feature currently being developed
- ✅ **Built** - Feature completed and shipped

**Current Features:**

- ✅ gitignore-check - Security pattern compliance with auto-detection and auto-fix
- ✅ language-detect - Evidence-based language detection via markers and extensions
- ✅ argus-send - Synchronous event dispatch to Argus observability platform
- ✅ lore-capture - Type-safe event logging for tasks, knowledge, notes
- ✅ llm-summarize - Multi-provider LLM text summarization
- ✅ lore-search - FTS5 full-text search across indexed knowledge
- 📋 agent-spawn - Spawn autonomous Claude SDK agents (deferred)
- 🔄 visual-mermaid - Mermaid diagram rendering with terminal noir theme (iteration-2)
- 🔄 visual-image - AI image generation with style presets (iteration-2)

## Technical Approach

**Architecture Decision**

- [x] **Composed Tool Ecosystem** - Multiple tools with clean interfaces

**Why this approach?**

Each tool is single-purpose and independently deployable. No shared runtime, no versioning coordination, no dependency hell. A bug in one tool doesn't break others. New tools can be added without touching existing ones.

**Dependencies & Prerequisites**

- Bun runtime (not Node.js) - selected for startup speed and native TypeScript
- For argus-send: Argus API key in `~/.config/argus/config.toml`
- For llm-summarize: API keys in `~/.config/llm/.env`
- For lore-search: Lore SQLite database initialized

**Integration Requirements**

- Unix pipes for tool chaining
- JSON output parseable by jq, LLMs, or downstream tools
- Exit codes: 0 = success, 1 = expected failure, 2 = unexpected error

**Data Requirements**

- lore-capture writes to `~/.local/share/lore/log.jsonl` (XDG-compliant)
- llm-summarize reads config from `~/.config/llm/config.toml`
- No shared data stores between tools

**Key Technical Constraints**

- Zero external npm dependencies per tool
- TypeScript strict mode, no `any` types
- ~300-400 lines per tool maximum
- Manual argument parsing only

## Technical Architecture (Tentative)

> **Note**: This section captures current technical thinking and design exploration.

**Data Design (Draft)**

- JSONL for append-only logs (lore-capture)
- TOML for configuration (human-readable, editable)
- JSON for tool output (machine-parseable)
- FTS5 SQLite for search (lore-search)

**Component Architecture (Working Model)**

```
packages/
├── gitignore-check/   # Security compliance
├── language-detect/   # Project analysis
├── argus-send/        # Observability
├── lore-capture/      # Knowledge logging
├── llm-summarize/     # LLM integration
├── lore-search/       # Knowledge retrieval
├── visual-mermaid/    # Diagram rendering (iteration-2)
└── visual-image/      # AI image generation (iteration-2)
```

Each package is fully independent - no shared code, no internal imports.

**Integration Points (Planned)**

- gitignore-check calls language-detect internally for language-specific patterns
- All tools can pipe to argus-send for observability
- lore-search queries data written by lore-capture (via shared Lore database)

**Tool/Technology Stack (Current Thinking)**

- Runtime: Bun
- Language: TypeScript (strict)
- Testing: Vitest (when needed)
- Package management: Bun workspaces (monorepo)

## Implementation Strategy (Subject to Change)

> **Note**: This section explores potential implementation approaches.

**Iteration Priorities (Draft)**

- Core tools first (gitignore-check, language-detect)
- Observability integration (argus-send)
- Knowledge pipeline (lore-capture, lore-search)
- LLM integration (llm-summarize)

**Deployment/Operations (Initial Thoughts)**

- `bun link` in each package directory for global CLI access
- No daemon processes, no background services
- Each invocation is stateless

**Data Flow (Conceptual)**

```
User/LLM → Tool → JSON stdout → pipe → next tool/jq/file
```

## Learning and Evolution

**Key Learnings**

- Zero-dependency approach works - tools are fast and reliable
- JSON output is correct choice for composability
- Manual arg parsing is fine for small tools, keeps them simple
- Bun startup time is noticeably better than Node

**Evolution Notes**

- Started with gitignore-check as proof of concept
- Added language-detect when gitignore-check needed it
- lore-capture replaced bash function sprawl
- llm-summarize and lore-search complete the knowledge pipeline

## Open Questions

**Technical Questions**

- Should tools share any common utilities or stay fully independent?
- How to handle tool versioning as the collection grows?
- Should there be a unified CLI entry point (`llcli <tool> <args>`)?

**Operational Questions**

- Documentation strategy - per-tool README vs unified docs?
- How to discover new friction points worth tooling?

## Success Metrics

**Primary Metrics**

- Tools used daily in real workflows without issues
- New tools can be created following the pattern in <1 hour
- Zero token waste on tasks tools handle

**Learning Metrics**

- Friction points identified through actual LLM workflow usage
- Patterns that emerge across multiple tools

## Risks and Assumptions

**Key Assumptions**

- Bun will remain a viable runtime choice
- JSON is the right interchange format for LLM consumption
- Single-purpose tools compose better than monolithic solutions

**Primary Risks**

- Tool proliferation making discovery/learning harder
- Bun-specific code limiting portability if needed later
- No shared utilities means duplicated patterns across tools

**Mitigation Strategies**

- Keep tool count manageable, only build for real friction
- Document patterns in CLI-DEVELOPMENT-GUIDE.md
- Accept some duplication as acceptable trade-off for independence
