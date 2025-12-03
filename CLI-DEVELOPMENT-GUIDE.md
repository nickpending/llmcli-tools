# llmcli-tools - Development Guide

This repository contains LLM-friendly CLI tools: simple, deterministic command-line utilities built with Bun and TypeScript.

## Philosophy

### Core Principles

1. **Simple** - Manual argument parsing, zero framework dependencies
2. **Deterministic** - Same input → Same output, always JSON
3. **Composable** - Pipes to jq, grep, other Unix tools
4. **Complete** - Production-ready, not scaffolds
5. **Type-safe** - TypeScript strict mode, no `any` types

### When to Build a New Tool

Create a new tool when:
- Task is repetitive and script-worthy
- Needs error handling and help text
- Benefits from type safety
- Should be reusable across projects
- Fits the pattern: 2-10 commands, simple arguments, JSON output


## Tool Characteristics

- Manual argument parsing (`process.argv`)
- Zero framework dependencies
- Bun + TypeScript
- Type-safe interfaces
- ~300-400 lines total
- JSON output

**Perfect for:**
- API clients
- Data transformers
- Simple automation
- File processors

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
├── tool-name.ts              # Main CLI (300-400 lines)
├── templates/                # Static templates (if needed)
│   └── *.template
├── package.json              # Bun configuration
├── README.md                 # Philosophy + usage
└── QUICKSTART.md             # Common examples
```

## Code Template

Every tool follows this structure:

```typescript
#!/usr/bin/env bun
/**
 * tool-name - Short description
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

import { /* imports */ } from "fs";

// Types
interface Result {
  success: boolean;
  data: any;
  error?: string;
}

// Core logic functions
function doWork(): Result {
  // Implementation
}

// CLI interface
function printUsage(): void {
  console.error(`
Usage: tool-name <args> [--flags]

Philosophy section explaining why.

Examples section showing how.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments manually
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Run work
  const result = await doWork();

  // Output JSON to stdout
  console.log(JSON.stringify(result, null, 2));

  // Diagnostics to stderr
  if (!result.success) {
    console.error(`❌ Error: ${result.error}`);
    process.exit(result.error ? 2 : 1);
  }

  console.error("✅ Success");
  process.exit(0);
}

main();
```

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
cd llcli-tools
mkdir -p new-tool/templates
```

### Step 2: Main Script

```bash
touch new-tool/new-tool.ts
chmod +x new-tool/new-tool.ts
```

Follow the code template above.

### Step 3: Package Configuration

Create `package.json` following the gitignore-check example.

### Step 4: Documentation

Create:
- `README.md` - Philosophy, usage, architecture
- `QUICKSTART.md` - Common examples

### Step 5: Test Locally

```bash
cd new-tool
bun run new-tool.ts --help
bun run new-tool.ts <test-args>
```

### Step 6: Install

```bash
bun link
new-tool --help  # Should work from PATH
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
├── gitignore-check.ts        # 300 lines
├── templates/
│   ├── base.gitignore        # Security + workspace patterns
│   ├── os/                   # macOS, Linux, Windows templates
│   └── languages/            # Python, TypeScript, Go, etc.
├── package.json
├── README.md
└── QUICKSTART.md
```

**Usage:**
```bash
gitignore-check .                    # Check current dir (auto-detects OS + languages)
gitignore-check /path/to/project     # Check specific project
gitignore-check . --fix              # Auto-fix (creates file if missing)
gitignore-check . | jq '.missing'    # Show missing patterns
```

**Key Features:**
- Calls `language-detect` to determine project languages
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
├── language-detect.ts        # 280 lines
├── package.json
├── README.md
└── QUICKSTART.md
```

**Usage:**
```bash
language-detect .                        # Detect current dir
language-detect . | jq -r '.languages[]' # List languages
language-detect . | jq '.markers'        # Show evidence
```

**Key Features:**
- Phase 1: Checks for marker files (package.json, go.mod, Cargo.toml, etc.)
- Phase 2: Counts files by extension if no markers found (configurable threshold)
- Used by gitignore-check to include language-specific patterns

**Inter-tool Composition:**
```typescript
// In gitignore-check.ts:
const languages = await detectLanguages(projectDir);
for (const lang of languages) {
  const langPath = join(scriptDir, "templates", "languages", `${lang}.gitignore`);
  // Load and merge language-specific patterns
}
```

Simple tools that work together via JSON output and direct function calls.

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
