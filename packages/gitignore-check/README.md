# gitignore-check

Gitignore compliance checker - Ensures projects include essential security patterns to prevent accidental commits of secrets, credentials, and sensitive data.

## Philosophy

**Security by default.** Most security breaches from leaked credentials happen because `.gitignore` patterns are incomplete or forgotten. This tool enforces a baseline of security patterns across all projects.

**Incremental enforcement.** Appends only missing patterns, never overwrites or removes existing entries. Respects your project-specific ignores while ensuring security baselines.

**Pattern coverage detection.** Smart enough to know that `.env*` already covers `.env` and `.env.local`. Won't add redundant patterns.

**Deterministic.** Outputs JSON, pipes to `jq`, follows Unix philosophy.

## The Problem

You start a project. You add `.gitignore`. You commit. Later:
- API key gets committed in `.env.local` (you only ignored `.env`)
- Database dump in `backups/` gets pushed
- `.claude/` workspace files with sensitive context leak
- `.mcp.json` with credentials goes to GitHub

**This tool prevents that.**

## Installation

```bash
# From llcli-tools repo:
./install.sh gitignore-check

# Installs to:
# ~/.local/bin/gitignore-check (executable)
# ~/.local/share/gitignore-check/ (tool data)
```

Ensure `~/.local/bin` is in your PATH:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc  # or ~/.zshrc
```

## Usage

```bash
gitignore-check <project-dir> [--fix]
```

### Check Compliance

```bash
cd /path/to/project
gitignore-check .
```

**Output (JSON):**
```json
{
  "compliant": false,
  "missing": [
    ".env.*",
    "*.key",
    "credentials.json",
    ".mcp.json"
  ],
  "fixed": false
}
```

Exit code `1` = non-compliant, `0` = compliant, `2` = error

### Auto-Fix

```bash
gitignore-check . --fix
```

Appends missing patterns to `.gitignore` with clear comment.

### Composability

```bash
# Show only missing patterns
gitignore-check . | jq '.missing'

# Count missing patterns
gitignore-check . | jq '.missing | length'

# Get missing patterns as raw list
gitignore-check . | jq -r '.missing[]'

# Check multiple projects
for dir in ~/projects/*; do
  echo "Checking $dir"
  gitignore-check "$dir" || echo "  ⚠️  Non-compliant"
done
```

## What It Checks

Base security patterns enforced:

**Security (Never commit these):**
- `.env`, `.env.*`, `.env.local` - Environment files
- `*.key`, `*.pem`, `*.p12`, `*.pfx` - Private keys
- `*_api_key*`, `*_secret*` - API keys and secrets
- `credentials.json`, `secrets/`, `private/` - Credential stores

**Workspace (Development artifacts):**
- `.workflow/`, `.claude/`, `.claudex/` - Claude Code workspace
- `.mcp.json`, `.playwright-mcp` - MCP server configs

**Sensitive Data:**
- `*.sqlite`, `*.db`, `*.dump` - Databases
- `data/`, `backups/` - Data directories

**IDE Files:**
- `.vscode/`, `.idea/`, `*.iml` - IDE configs
- `.eclipse/`, `.settings/`, `*.sublime-*` - Other IDEs

**System Files:**
- `.DS_Store`, `Thumbs.db` - OS artifacts
- `*.swp`, `*.swo`, `*~` - Editor temp files

**Build Artifacts:**
- `dist/`, `build/`, `out/`, `target/` - Build outputs
- `*.log`, `logs/`, `coverage/` - Logs and coverage
- `test-results/` - Test artifacts

## How It Works

1. **Load base template** - Reads `templates/base.gitignore` (security patterns)
2. **Parse project gitignore** - Extracts existing patterns from project `.gitignore`
3. **Compare patterns** - Finds missing patterns, accounting for wildcards
4. **Fix if requested** - Appends only missing patterns with comment
5. **Output JSON** - Deterministic result for automation

**Pattern coverage logic:**
- Exact match: `.env` present → `.env` covered
- Wildcard match: `.env*` present → `.env`, `.env.local` covered
- No match: `.env.*` missing → Flag as missing

## Integration

### Momentum Hooks

Momentum's session-start hook calls this automatically:

```typescript
const result = Bun.spawnSync(["gitignore-check", cwd]);
if (result.exitCode === 1) {
  console.error("⚠️  Gitignore non-compliant. Run: gitignore-check . --fix");
}
```

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit
gitignore-check . || {
  echo "❌ Gitignore non-compliant. Run: gitignore-check . --fix"
  exit 1
}
```

### CI/CD

```yaml
# .github/workflows/security.yml
- name: Check gitignore compliance
  run: |
    gitignore-check . || {
      echo "::error::Gitignore missing security patterns"
      exit 1
    }
```

## Architecture

**Structure:**
```
gitignore-check/
├── gitignore-check.ts        # Main CLI (~250 lines)
├── templates/
│   └── base.gitignore        # Base security patterns
├── package.json
├── README.md
└── QUICKSTART.md
```

**Design:**
- Manual arg parsing, zero deps
- TypeScript strict mode
- Bun runtime
- JSON output to stdout
- Diagnostics to stderr

**No external dependencies.** Self-contained, fast, reliable.

## Examples

See [QUICKSTART.md](./QUICKSTART.md) for common usage patterns.

## Related Tools

Part of [llmcli-tools](../) monorepo - simple, deterministic CLIs for development automation.
- Security-first philosophy
- XDG-compliant installation
- Deterministic outputs

## License

MIT
