# llmcli-tools - Development Guide

This repository contains LLM-friendly CLI tools: simple, deterministic command-line utilities built with Bun and TypeScript.

## Philosophy

### Core Principles

1. **Simple** - Manual argument parsing, zero framework dependencies
2. **Deterministic** - Same input → Same output, always JSON
3. **Composable** - Pipes to jq, grep, other Unix tools
4. **Complete** - Production-ready, not scaffolds
5. **Type-safe** - TypeScript strict mode, no `any` types
6. **Dual-use** - Library-first with CLI wrapper for both programmatic and shell access

### When to Build a New Tool

Create a new tool when:
- Task is repetitive and script-worthy
- Needs error handling and help text
- Benefits from type safety
- Should be reusable across projects
- Fits the pattern: 2-10 commands, simple arguments, JSON output


## Tool Characteristics

- Manual argument parsing (`process.argv`) in CLI layer only
- Zero framework dependencies
- Bun + TypeScript
- Type-safe interfaces
- Library core + thin CLI wrapper
- JSON output

**Perfect for:**
- API clients
- Data transformers
- Simple automation
- File processors
- Hook integrations (programmatic import)

## Technology Stack

All tools in this repo use:

- ✅ **Runtime:** Bun (NOT Node.js)
- ✅ **Language:** TypeScript (NOT JavaScript or Python)
- ✅ **Package Manager:** Bun (NOT npm/yarn/pnpm)
- ✅ **Output:** Deterministic JSON (composable)
- ✅ **Testing:** Vitest (when tests added)

## Structure Template

```
tool-name/
├── index.ts                  # Library exports (pure functions, no process.exit)
├── cli.ts                    # CLI wrapper (arg parsing, process.exit, stderr)
├── lib/                      # Internal modules (optional)
│   └── *.ts
├── templates/                # Static templates (if needed)
│   └── *.template
├── package.json              # Bun configuration (exports "." and "./cli")
├── README.md                 # Philosophy + usage
└── QUICKSTART.md             # Common examples
```

### Library vs CLI Separation

**index.ts (Library)**
- Pure functions that return typed results
- Never calls `process.exit()`
- Never writes to `stderr` or uses `console.error()`
- Returns `{ success, data, error }` objects
- Can throw for unexpected errors (callers catch)

**cli.ts (CLI Wrapper)**
- Imports from `./index.ts`
- Parses `process.argv`
- Handles `--help` flag
- Writes JSON to `stdout`
- Writes diagnostics to `stderr`
- Calls `process.exit()` with appropriate codes

## Code Template

Every tool follows this dual-file structure:

### index.ts (Library)

```typescript
/**
 * tool-name - Short description
 *
 * Library exports for programmatic use.
 * No process.exit, no stderr, pure functions only.
 */

// Types - exported for consumers
export interface ToolInput {
  path: string;
  options?: ToolOptions;
}

export interface ToolOptions {
  fix?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: ToolData;
  error?: string;
}

export interface ToolData {
  // Tool-specific output
}

// Core logic - pure functions
export function doWork(input: ToolInput): ToolResult {
  try {
    // Implementation
    return { success: true, data: { /* ... */ } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Convenience exports for common operations
export async function doWorkAsync(input: ToolInput): Promise<ToolResult> {
  // Async variant if needed
}
```

### cli.ts (CLI Wrapper)

```typescript
#!/usr/bin/env bun
/**
 * tool-name CLI
 *
 * Philosophy:
 * - Why this tool exists
 * - Core principle
 * - Key behavior
 *
 * Usage:
 *   tool-name <args> [--flags]
 *
 * Examples:
 *   tool-name foo
 *   tool-name bar --flag
 *
 * Exit codes:
 *   0 - Success
 *   1 - Failure (expected)
 *   2 - Error (unexpected)
 */

import { doWork, type ToolInput } from "./index";

function printUsage(): void {
  console.error(`
tool-name - Short description

Philosophy:
  Why this tool exists and core principles.

Usage: tool-name <path> [--flags]

Examples:
  tool-name .              # Basic usage
  tool-name . --fix        # With fix flag
`);
}

function parseArgs(argv: string[]): ToolInput | null {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return null;
  }

  return {
    path: args[0],
    options: {
      fix: args.includes("--fix"),
    },
  };
}

async function main(): Promise<void> {
  const input = parseArgs(process.argv);

  if (!input) {
    printUsage();
    process.exit(0);
  }

  const result = doWork(input);

  // JSON to stdout (always)
  console.log(JSON.stringify(result, null, 2));

  // Diagnostics to stderr
  if (!result.success) {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }

  console.error("✅ Done");
  process.exit(0);
}

main();
```

### package.json exports

```json
{
  "name": "tool-name",
  "type": "module",
  "bin": {
    "tool-name": "./cli.ts"
  },
  "exports": {
    ".": "./index.ts",
    "./cli": "./cli.ts"
  },
  "main": "./index.ts"
}
```

### Usage from TypeScript (Momentum hooks)

```typescript
// Direct import - no subprocess overhead
import { doWork } from "tool-name";

const result = doWork({ path: ".", options: { fix: true } });
if (result.success) {
  // Handle result.data
}
```

### Usage from shell

```bash
# CLI wrapper for shell scripts
tool-name . --fix | jq '.data'
```

## Integration Patterns

### Importing in TypeScript Projects

Tools can be used programmatically without subprocess overhead:

```typescript
// Direct library import (preferred for frequent calls)
import { summarize, loadConfig } from "llm-summarize";
import { captureKnowledge } from "lore-capture";
import { send as sendToArgus } from "argus-send";
import { detectLanguages } from "language-detect";
import { checkCompliance } from "gitignore-check";
import { search } from "lore-search";

// Example: Summarize in a hook
const config = loadConfig();
const result = await summarize("text to summarize", config);
if (result.summary) {
  console.log(result.summary);
}

// Example: Capture knowledge
const captureResult = captureKnowledge({
  context: "project-name",
  text: "Important insight discovered",
  type: "learning",
});

// Example: Send event to Argus
const argusResult = await sendToArgus({
  source: "my-tool",
  event_type: "task_complete",
  level: "info",
  data: { task: "build" },
});
```

### Workspace Dependencies

When one tool depends on another, use workspace references:

```json
{
  "name": "gitignore-check",
  "dependencies": {
    "language-detect": "workspace:*"
  }
}
```

Then import directly (no subprocess):

```typescript
// gitignore-check/index.ts
import { detectLanguages } from "language-detect";

const languages = await detectLanguages(projectDir);
```

### When to Use Library vs CLI

| Use Case | Approach |
|----------|----------|
| Hooks running on every prompt | Library import |
| Hooks running once per session | Either works |
| Shell scripts | CLI via `bun link` |
| CI/CD pipelines | CLI for isolation |
| Testing | Library for unit tests |

**Rule of thumb:** If it runs frequently (every prompt/stop), use library import. If it runs occasionally or needs process isolation, use CLI.

### Available Tool Exports

| Tool | Primary Export | Types |
|------|---------------|-------|
| `llm-summarize` | `summarize(text, config, options?)` | `SummarizeResult`, `LLMConfig` |
| `lore-capture` | `captureKnowledge(input)`, `captureTask(input)`, `captureNote(input)` | `CaptureResult`, `KnowledgeInput` |
| `argus-send` | `sendEvent(event, apiKey, host?)`, `send(event)` | `SendResult`, `ArgusEvent` |
| `language-detect` | `detectLanguages(dir)`, `detectLanguagesSync(dir)` | `DetectionResult` |
| `gitignore-check` | `checkCompliance(dir, options?)` | `ComplianceResult` |
| `lore-search` | `search(query, options?)`, `listSources()` | `SearchResult` |

### Error Handling Pattern

Library functions return result objects instead of throwing:

```typescript
import { summarize, loadConfig } from "llm-summarize";

const config = loadConfig();
const result = await summarize(text, config);

if (result.error) {
  // Handle error - no try/catch needed
  console.error(`Summarization failed: ${result.error}`);
} else {
  // Use result.summary
  console.log(result.summary);
}
```

This pattern:
- Avoids try/catch boilerplate
- Makes error handling explicit
- Works well with optional chaining: `result.summary ?? "default"`

## Quality Standards

Every tool must have:

### 1. Compilation
- ✅ TypeScript compiles with zero errors
- ✅ Strict mode enabled (`tsconfig.json`)
- ✅ No `any` types except justified

### 2. Functionality
- ✅ All commands work as specified
- ✅ Error handling comprehensive
- ✅ Exit codes correct (0 success, 1 failure, 2 error)

### 3. Documentation
- ✅ README explains philosophy and usage
- ✅ QUICKSTART has common examples
- ✅ `--help` text comprehensive
- ✅ All flags/options documented

### 4. Code Quality
- ✅ Type-safe throughout
- ✅ Clean function separation
- ✅ Error messages actionable
- ✅ Configuration externalized

### 5. Output
- ✅ Deterministic JSON to stdout
- ✅ Diagnostics to stderr
- ✅ Composable with pipes

## Installation

Tools install to XDG-compliant paths:

```
~/.local/bin/tool-name              # Executable (symlink)
~/.local/share/tool-name/           # Data directory
├── tool-name.ts                    # Main script
├── templates/                      # Templates (if any)
├── package.json
├── README.md
└── QUICKSTART.md
```

Use `bun link` from the package directory:

```bash
cd packages/tool-name && bun link
```

Or link all tools at once from repo root:

```bash
for dir in packages/*/; do (cd "$dir" && bun link); done
```

## Creating a New Tool

### Step 1: Directory Structure

```bash
cd packages
mkdir -p new-tool/lib
```

### Step 2: Create Library (index.ts)

```bash
touch new-tool/index.ts
```

Write pure functions with typed inputs/outputs. No `process.exit()`, no `console.error()`.

### Step 3: Create CLI Wrapper (cli.ts)

```bash
touch new-tool/cli.ts
chmod +x new-tool/cli.ts
```

Import from `./index.ts`, add arg parsing, handle `--help`, manage exit codes.

### Step 4: Package Configuration

Create `package.json` with dual exports:

```json
{
  "name": "new-tool",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.ts",
  "bin": {
    "new-tool": "./cli.ts"
  },
  "exports": {
    ".": "./index.ts",
    "./cli": "./cli.ts"
  }
}
```

### Step 5: Documentation

Create:
- `README.md` - Philosophy, usage, architecture
- `QUICKSTART.md` - Common examples

### Step 6: Test Locally

```bash
cd packages/new-tool

# Test library
bun -e "import { doWork } from './index.ts'; console.log(doWork({...}))"

# Test CLI
bun run cli.ts --help
bun run cli.ts <test-args>
```

### Step 7: Install Globally

```bash
bun link
new-tool --help  # Should work from PATH
```

### Step 8: Use from Other Tools

If another tool needs to use yours:

```json
// other-tool/package.json
{
  "dependencies": {
    "new-tool": "workspace:*"
  }
}
```

```typescript
// other-tool/index.ts
import { doWork } from "new-tool";
```

## Examples

### gitignore-check

Security-first gitignore compliance checker with auto-detection.

**Philosophy:**
- Prevents accidental commits of secrets
- Auto-detects OS and languages (no manual config)
- Incremental enforcement (appends missing patterns only)
- Pattern coverage detection (`.env*` covers `.env`)

**Structure:**
```
gitignore-check/
├── index.ts              # Library: checkCompliance()
├── cli.ts                # CLI wrapper
├── templates/
│   ├── base.gitignore    # Security + workspace patterns
│   ├── os/               # macOS, Linux, Windows templates
│   └── languages/        # Python, TypeScript, Go, etc.
└── package.json
```

**Library Usage:**
```typescript
import { checkCompliance } from "gitignore-check";

const result = await checkCompliance("/path/to/project", { fix: true });
if (!result.compliant) {
  console.log(`Missing: ${result.missing?.join(", ")}`);
}
```

**CLI Usage:**
```bash
gitignore-check .                    # Check current dir
gitignore-check . --fix              # Auto-fix missing patterns
gitignore-check . | jq '.missing'    # Show missing patterns
```

**Key Features:**
- Imports `language-detect` as library (no subprocess)
- Combines base + OS + language-specific patterns automatically
- Creates .gitignore if missing (with `--fix` flag)

### language-detect

Fast language detector with evidence-based output.

**Philosophy:**
- Evidence-based detection (shows WHY each language detected)
- Two-phase: marker files first, extension count fallback
- Composable output for tooling integration
- No configuration needed

**Structure:**
```
language-detect/
├── index.ts              # Library: detectLanguages(), detectLanguagesSync()
├── cli.ts                # CLI wrapper
└── package.json
```

**Library Usage:**
```typescript
import { detectLanguages, detectLanguagesSync } from "language-detect";

// Async
const result = await detectLanguages("/path/to/project");
console.log(result.languages); // ["typescript", "python"]
console.log(result.markers.typescript); // ["tsconfig.json", "*.ts files"]

// Sync (for contexts where async unavailable)
const syncResult = detectLanguagesSync("/path/to/project");
```

**CLI Usage:**
```bash
language-detect .                        # Detect current dir
language-detect . | jq -r '.languages[]' # List languages
language-detect . | jq '.markers'        # Show evidence
```

**Key Features:**
- Phase 1: Checks for marker files (package.json, go.mod, Cargo.toml, etc.)
- Phase 2: Counts files by extension if no markers found
- Used by gitignore-check via library import

### llm-summarize

Fast LLM-powered text summarization for observability.

**Structure:**
```
llm-summarize/
├── index.ts              # Library: summarize(), loadConfig()
├── cli.ts                # CLI wrapper
└── package.json
```

**Library Usage:**
```typescript
import { summarize, loadConfig } from "llm-summarize";

const config = loadConfig(); // Reads ~/.config/llm/config.toml
const result = await summarize("Text to summarize", config);

if (result.summary) {
  console.log(result.summary);
}
```

**CLI Usage:**
```bash
llm-summarize "Quick summary of this text"
echo "Long text" | llm-summarize --stdin
```

### Inter-tool Composition

Tools can import each other as libraries:

```typescript
// gitignore-check/index.ts imports language-detect
import { detectLanguages } from "language-detect";

const { languages } = await detectLanguages(projectDir);
for (const lang of languages) {
  // Load language-specific gitignore patterns
}
```

This eliminates subprocess overhead and provides type safety.

## LLM-Friendly Output

### Core Principle

**Emit what's actionable.** If the LLM isn't taking action on a field, don't include it.

### Terse by Default

```typescript
// LLM just needs to know: did it work?
{ "success": true }

// LLM needs to fix something:
{ "success": false, "missing": ["*.env", ".DS_Store"] }

// LLM needs to decide between options:
{ "languages": ["typescript", "python"] }
```

### Context When Acting

Include evidence/reasoning **only when the LLM must make a decision**:

```typescript
// Good: LLM needs to understand WHY these languages
{
  "languages": ["typescript"],
  "markers": ["tsconfig.json", "7 *.ts files"]
}

// Bad: LLM doesn't care about detection method
{
  "languages": ["typescript"],
  "detection_method": "extension_fallback",
  "threshold": 0,
  "scan_duration_ms": 45
}
```

### Standard Fields

When you do include fields:
- `success` - Boolean first (LLMs check this)
- `error` - Human-readable (only on failure)
- `data` - Main payload (flat when possible)
- Evidence fields - Show WHY when LLM must reason

### Examples

**gitignore-check** - Terse success, detailed failure:
```typescript
// Compliant project
{ "compliant": true }

// Non-compliant (LLM needs to know what to fix)
{
  "compliant": false,
  "missing": ["*.env*", ".DS_Store"],
  "sources": ["base", "macos"]
}
```

**language-detect** - Evidence only when detecting:
```typescript
// Clear detection
{ "languages": ["typescript", "python"] }

// Ambiguous (LLM needs evidence to understand)
{
  "languages": ["typescript"],
  "markers": ["7 *.ts files"]  // No package.json, so explain
}
```

### What NOT to Include

- Timestamps (unless driving time-based decisions)
- Version fields (unless compatibility matters)
- Metadata about the tool itself
- Success messages in `data` (use exit code + `success` boolean)
- Nested wrappers (`{result: {data: {...}}}`)

**Token efficiency over structure ceremony.**

## Best Practices

### Argument Parsing

```typescript
// Good: Simple and explicit
const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");
const projectDir = args[0];

// Bad: Over-engineered for simple CLI
import yargs from "yargs";
const argv = yargs.option("fix", { type: "boolean" }).argv;
```

### Error Handling

```typescript
// Good: Structured errors with context
if (!existsSync(path)) {
  return {
    success: false,
    error: `File not found: ${path}`,
  };
}

// Bad: Throwing without structure
if (!existsSync(path)) {
  throw new Error("File not found");
}
```

### Output

```typescript
// Good: JSON to stdout, diagnostics to stderr
console.log(JSON.stringify(result, null, 2));
console.error("✅ Success");

// Bad: Mixed output to stdout
console.log("Success!");
console.log(JSON.stringify(result));
```

### Help Text

```typescript
// Good: Philosophy + examples
function printUsage(): void {
  console.error(`
tool-name - What it does

Philosophy:
  Why this exists and core principles.

Usage: tool-name <args> [--flags]

Examples:
  tool-name foo        # Description
  tool-name bar --fix  # Description
`);
}

// Bad: Just syntax
function printUsage(): void {
  console.error("Usage: tool-name <args>");
}
```

---
