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

**Production-ready tools in active daily use.** Four tools shipped: gitignore-check, language-detect, argus-send, and lore-capture.

## Philosophy

Offload simple, repetitive tasks to deterministic scripts so LLMs can focus on what they're good at. Why burn tokens checking gitignore compliance when a 300-line script does it instantly?

**Core principles:**

- **Simple** - Manual argument parsing, zero framework dependencies
- **Deterministic** - Same input → Same output, always JSON
- **Composable** - Pipes to jq, grep, other Unix tools
- **Complete** - Production-ready, not scaffolds
- **Type-safe** - TypeScript strict mode throughout

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

## Installation

### Quick Setup

```bash
# Clone repo
git clone https://github.com/yourusername/llcli-tools.git
cd llcli-tools

# Install all workspace packages
bun install

# Make tools globally available
cd packages/gitignore-check && bun link
cd ../language-detect && bun link
cd ../argus-send && bun link
cd ../lore-capture && bun link
```

Now all tools are available globally:
```bash
gitignore-check .
language-detect .
argus-send --source test --type ping
lore-capture task --project=test --name="Task" --problem="P" --solution="S"
```

### Development Usage (No Global Install)

```bash
cd llcli-tools
bun install

# Run directly via bun
bun packages/gitignore-check/gitignore-check.ts .

# Or via package script (if defined in root package.json)
bun run gitignore-check .
```

## Development

### Structure

```
llcli-tools/
├── package.json                 # Root workspace config
├── bun.lockb                    # Shared lockfile
├── packages/
│   ├── gitignore-check/
│   │   ├── gitignore-check.ts
│   │   ├── templates/
│   │   │   ├── base.gitignore
│   │   │   ├── os/
│   │   │   └── languages/
│   │   ├── package.json
│   │   ├── README.md
│   │   └── QUICKSTART.md
│   ├── language-detect/
│   │   ├── language-detect.ts
│   │   ├── package.json
│   │   ├── README.md
│   │   └── QUICKSTART.md
│   ├── argus-send/
│   │   ├── argus-send.ts
│   │   ├── package.json
│   │   ├── README.md
│   │   └── QUICKSTART.md
│   ├── lore-capture/
│   │   ├── lore-capture.ts
│   │   ├── commands/
│   │   ├── lib/
│   │   ├── package.json
│   │   ├── README.md
│   │   └── QUICKSTART.md
│   └── (future tools)
├── CLI-DEVELOPMENT-GUIDE.md     # How to build new tools
└── README.md
```

### Adding a New Tool

See [CLI-DEVELOPMENT-GUIDE.md](./CLI-DEVELOPMENT-GUIDE.md) for the complete process.

**Quick version:**

1. Create tool directory:
   ```bash
   mkdir -p packages/new-tool/templates
   ```

2. Create `packages/new-tool/new-tool.ts` following llcli pattern

3. Create `packages/new-tool/package.json`:
   ```json
   {
     "name": "new-tool",
     "version": "1.0.0",
     "type": "module",
     "main": "new-tool.ts",
     "bin": {
       "new-tool": "./new-tool.ts"
     }
   }
   ```

4. Write README.md and QUICKSTART.md

5. Install and test:
   ```bash
   bun install
   cd packages/new-tool
   bun run new-tool.ts --help
   ```

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
