# llmcli-tools

<div align="center">

  **LLM-friendly CLI tools: simple, deterministic, type-safe**

  [![Status](https://img.shields.io/badge/Status-Active-green?style=flat)](#status-active)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

Collection of zero-dependency TypeScript CLIs built with Bun. Manual argument parsing, JSON output, designed for LLM agent consumption.

Building blocks for development automation - gitignore compliance, language detection, observability events, and knowledge capture.

## Status: Active

**Production-ready tools in active daily use.** Nine tools shipped: gitignore-check, language-detect, argus-send, lore-capture, lore-search, llm-summarize, visual-mermaid, visual-image, and expertise-update.

## Philosophy

Offload simple, repetitive tasks to deterministic scripts so LLMs can focus on what they're good at. Why burn tokens checking gitignore compliance when a 300-line script does it instantly?

**Core principles:**

- **Simple** - Manual argument parsing, zero framework dependencies
- **Deterministic** - Same input → Same output, always JSON
- **Composable** - Pipes to jq, grep, other Unix tools
- **Complete** - Production-ready, not scaffolds
- **Type-safe** - TypeScript strict mode throughout
- **Dual-use** - Library exports + CLI wrapper for flexible integration

## Available Tools

### gitignore-check

Gitignore compliance checker with auto-detection of OS and languages.

**Features:**
- Auto-detects OS (macOS, Linux, Windows) and project languages
- Combines base + OS-specific + language-specific patterns from GitHub templates
- Pattern coverage detection (`.env*` covers `.env`)
- Creates .gitignore if missing (with `--fix`)

```bash
gitignore-check .                # Check current directory
gitignore-check . --fix          # Auto-fix (creates file if missing)
gitignore-check . | jq '.missing'  # Show missing patterns
```

[Documentation](./packages/gitignore-check/README.md) | [Quick Start](./packages/gitignore-check/QUICKSTART.md)

### language-detect

Fast programming language detector with evidence-based output.

**Features:**
- Two-phase detection: marker files first, extension count fallback
- Configurable threshold (default: detect any files)
- Composable JSON output for CI/CD, tooling integration

```bash
language-detect .                        # Detect current directory
language-detect . | jq -r '.languages[]' # List languages only
language-detect . | jq '.markers'        # Show detection evidence
```

[Documentation](./packages/language-detect/README.md) | [Quick Start](./packages/language-detect/QUICKSTART.md)

**Integration:** gitignore-check automatically calls language-detect to include language-specific patterns.

### argus-send

Send events to Argus observability platform from command line.

**Features:**
- Synchronous delivery - Blocks until Argus confirms capture
- Config-aware - Reads API key from `~/.config/argus/config.toml`
- Composable - Pipes JSON data from other llcli tools to Argus
- Stdin support - Chain with gitignore-check, language-detect, any JSON producer

```bash
argus-send --source llcli-tools --type gitignore-check --level info
gitignore-check . | argus-send --source llcli-tools --type gitignore-check --stdin
echo '{"test": "data"}' | argus-send --source my-app --type event --stdin
```

[Documentation](./packages/argus-send/README.md) | [Quick Start](./packages/argus-send/QUICKSTART.md)

**Integration:** All llcli-tools can pipe their JSON output to argus-send for unified observability.

### lore-capture

Type-safe event logging for tasks, knowledge insights, and notes.

**Features:**
- Replaces bash capture function sprawl with unified TypeScript CLI
- Three subcommands: task, knowledge, note
- Type-safe validation with model-friendly error messages
- Logs to ~/.local/share/lore/log.jsonl in JSONL format

```bash
lore-capture task --project=myapp --name="Add feature" --problem="..." --solution="..."
lore-capture knowledge --context=project --text="Insight here" --type=project
lore-capture note --text="Quick note" --tags=reminder,testing
```

[Documentation](./packages/lore-capture/README.md) | [Quick Start](./packages/lore-capture/QUICKSTART.md)

**Integration:** Momentum hooks use lore-capture to log task completions and knowledge insights.

### lore-search

FTS5 full-text search across your indexed knowledge fabric.

**Features:**
- SQLite FTS5 for sub-second queries across all indexed content
- Source filtering (blogs, commits, events, projects)
- FTS5 query syntax support (phrases, OR, prefix matching)
- Composable JSON output

```bash
lore-search "authentication"           # Search all sources
lore-search blogs "typescript"         # Search only blogs
lore-search --sources                  # List indexed sources
lore-search "error" | jq '.results[]'  # Pipe results to jq
```

[Documentation](./packages/lore-search/README.md)

**Integration:** Query your personal knowledge base from scripts, hooks, or other tools.

### llm-summarize

LLM-powered text summarization via Anthropic Claude API.

**Features:**
- Configurable summary styles (brief, detailed, technical, executive)
- Stdin support for piping content
- Config file support (~/.config/llm-summarize/config.toml)
- Token-aware chunking for large documents

```bash
llm-summarize "Text to summarize"
cat document.md | llm-summarize --stdin --style=technical
llm-summarize --style=executive "Meeting notes..."
```

[Documentation](./packages/llm-summarize/README.md)

**Integration:** Summarize content programmatically in TypeScript hooks and automation.

### visual-mermaid

Render Mermaid diagrams to PNG/SVG with terminal-noir theming.

**Features:**
- Inline code, file input, or stdin support
- Terminal-noir theme with cyan/slate color palette
- Configurable output format (PNG, SVG, PDF)
- macOS `--open` flag to launch Preview

```bash
visual-mermaid --code "flowchart TD; A-->B" -o diagram.png
visual-mermaid -i diagram.mmd -o output.png --theme terminal-noir
cat diagram.mmd | visual-mermaid -o flow.png --open
```

[Documentation](./packages/visual-mermaid/README.md)

**Config:** Copy `packages/visual-mermaid/config.example.toml` to `~/.config/visual-mermaid/config.toml`

**Integration:** Generate diagrams programmatically for documentation and blogs.

### visual-image

AI image generation via Replicate (Flux) and Google (nano-banana-pro).

**Features:**
- Multiple providers: Flux 1.1 Pro via Replicate, Gemini 3 Pro via Google
- Style presets: tokyo-noir (Blade Runner aesthetic), wireframe (technical mockups)
- Configurable aspect ratio and size
- `--raw` flag to skip style injection

```bash
visual-image -m flux -p "developer workspace at night" -o hero.png
visual-image -m nano-banana-pro -p "city street" -o city.png --style tokyo-noir
visual-image -m nano-banana-pro -p "admin dashboard" -o wireframe.png --style wireframe --open
```

[Documentation](./packages/visual-image/README.md)

**Config:** Copy `packages/visual-image/config.example.toml` to `~/.config/visual-image/config.toml`

**API Keys:** Add `REPLICATE_API_TOKEN` and `GOOGLE_API_KEY` to `~/.config/llm/.env`

**Integration:** Generate images programmatically for blog posts and visual content.

### expertise-update

Sync Lore insights into PROJECT_EXPERTISE.toml for agent knowledge persistence.

**Features:**
- Queries Lore for project-specific captures (gotchas, decisions, learnings)
- Additive merge - preserves existing insights, deduplicates by content
- Silent on missing expertise file (exit 0, nothing to update)
- JSON output with update statistics

```bash
expertise-update --project argus --root ~/development/projects/argus
expertise-update -p momentum -r ~/development/projects/momentum
```

[Documentation](./packages/expertise-update/README.md)

**Integration:** Used by Momentum's `/update-expertise` command to sync Lore insights into project expertise files.

## Installation

### Step 1: Clone and install dependencies

```bash
git clone https://github.com/yourusername/llcli-tools.git
cd llcli-tools
bun install
```

### Step 2: Link tools globally

```bash
# Link all tools
for dir in packages/*/; do (cd "$dir" && bun link); done

# Or link individual tools
cd packages/gitignore-check && bun link
```

Tools are now available globally (requires `~/.bun/bin` in PATH):
```bash
gitignore-check .
language-detect .
argus-send --source test --type ping
lore-capture task --project=test --name="Task" --problem="P" --solution="S"
```

### Running without global install

Run tools directly without linking:

```bash
bun packages/gitignore-check/cli.ts .
bun packages/language-detect/cli.ts .
```

## Development

### Structure

All tools follow the hybrid library+CLI pattern:

```
llcli-tools/
├── package.json                 # Root workspace config
├── bun.lock                     # Shared lockfile
├── packages/
│   └── {tool-name}/
│       ├── index.ts             # Library exports (pure functions)
│       ├── cli.ts               # CLI wrapper (arg parsing, exit codes)
│       ├── lib/                 # Internal implementation (optional)
│       ├── templates/           # Static assets (optional)
│       ├── package.json
│       └── README.md
├── CLI-DEVELOPMENT-GUIDE.md     # How to build new tools
└── README.md
```

### Adding a New Tool

See [CLI-DEVELOPMENT-GUIDE.md](./CLI-DEVELOPMENT-GUIDE.md) for the complete process.

**Quick version:**

1. Create tool directory and files:
   ```bash
   mkdir packages/new-tool
   touch packages/new-tool/{index.ts,cli.ts,package.json}
   ```

2. Implement `index.ts` with pure library functions (no process.exit, no stderr)

3. Implement `cli.ts` as thin wrapper with arg parsing and exit codes

4. Create `package.json` with dual exports:
   ```json
   {
     "name": "new-tool",
     "version": "1.0.0",
     "type": "module",
     "main": "./index.ts",
     "bin": { "new-tool": "./cli.ts" },
     "exports": {
       ".": "./index.ts",
       "./cli": "./cli.ts"
     }
   }
   ```

5. Install and test:
   ```bash
   bun install && cd packages/new-tool && bun link
   new-tool --help
   ```

### Library Integration

All tools export pure functions for direct import:

```typescript
import { checkCompliance } from "gitignore-check";
import { detectLanguages } from "language-detect";
import { send as sendToArgus } from "argus-send";
import { captureKnowledge } from "lore-capture";
import { search } from "lore-search";
import { summarize } from "llm-summarize";
import { renderMermaid } from "visual-mermaid";
import { generateImage } from "visual-image";
import { updateExpertise } from "expertise-update";
```

Use library imports for:
- High-frequency calls (hooks, automation)
- Type-safe error handling
- Avoiding subprocess overhead

### Workspace Benefits

- **Shared dependencies** - No duplication across tools
- **Single install** - `bun install` at root installs everything
- **Consistent versions** - One lockfile for all packages
- **Easy cross-imports** - Import between packages if needed

## Design Principles

Every tool follows these rules:

1. **Simple** - Manual arg parsing, no frameworks (300-400 lines)
2. **JSON output** - Pipes to jq/grep
3. **Error codes** - 0 = success, 1 = failure, 2 = error
4. **Help text** - Philosophy section + examples
5. **Type-safe** - TypeScript strict mode, no `any`

## Contributing

New tools should:
1. Follow these principles (see CLI-DEVELOPMENT-GUIDE.md)
2. Include comprehensive README + QUICKSTART
3. Output deterministic JSON
4. Have clear philosophy section explaining "why"
5. Be production-ready, not scaffolds

## Credits

Pattern inspired by Daniel Miessler's [system-createcli](https://github.com/danielmiessler/Personal_AI_Infrastructure/tree/main/.claude/skills/system-createcli).

## License

MIT
