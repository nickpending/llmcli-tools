# gitignore-check - Quick Start

Common usage patterns for gitignore compliance checking.

## Basic Usage

### Check Current Project

```bash
cd ~/projects/my-app
gitignore-check .
```

**Output:**
```json
{
  "compliant": false,
  "missing": [".env.*", "*.key", ".mcp.json"],
  "fixed": false
}
```

Exit code: `1` (non-compliant)

### Auto-Fix

```bash
gitignore-check . --fix
```

**Result:**
- Missing patterns appended to `.gitignore`
- Clear comment added: `# Base compliance patterns (auto-added by gitignore-check)`
- Exit code: `0` (now compliant)

### Check Specific Project

```bash
gitignore-check ~/projects/another-app
```

## Common Patterns

### New Project Setup

```bash
# Create project
mkdir my-new-project
cd my-new-project
git init

# Create basic gitignore
echo "node_modules/" > .gitignore

# Check compliance
gitignore-check .

# Auto-fix to add security patterns
gitignore-check . --fix

# Verify
gitignore-check .
# Exit code 0 = compliant
```

### Audit All Projects

```bash
#!/bin/bash
# Check all projects for compliance

for dir in ~/projects/*; do
  if [ -d "$dir/.git" ]; then
    echo "Checking $(basename $dir)..."
    gitignore-check "$dir" || echo "  ⚠️  Non-compliant"
  fi
done
```

### Fix All Projects

```bash
#!/bin/bash
# Auto-fix all projects

for dir in ~/projects/*; do
  if [ -d "$dir/.git" ]; then
    echo "Fixing $(basename $dir)..."
    gitignore-check "$dir" --fix
  fi
done
```

## JSON Processing with jq

### Show Only Missing Patterns

```bash
gitignore-check . | jq '.missing'
```

**Output:**
```json
[
  ".env.*",
  "*.key",
  "credentials.json"
]
```

### Count Missing Patterns

```bash
gitignore-check . | jq '.missing | length'
```

**Output:**
```
3
```

### Extract as Raw List

```bash
gitignore-check . | jq -r '.missing[]'
```

**Output:**
```
.env.*
*.key
credentials.json
```

### Check If Compliant (Boolean)

```bash
gitignore-check . | jq '.compliant'
```

**Output:**
```
false
```

### Generate Report

```bash
#!/bin/bash
# Generate compliance report

echo "# Gitignore Compliance Report"
echo "Generated: $(date)"
echo ""

for dir in ~/projects/*; do
  if [ -d "$dir/.git" ]; then
    name=$(basename "$dir")
    result=$(gitignore-check "$dir")
    compliant=$(echo "$result" | jq -r '.compliant')
    missing=$(echo "$result" | jq -r '.missing | length')

    if [ "$compliant" = "true" ]; then
      echo "✅ $name - Compliant"
    else
      echo "❌ $name - Missing $missing pattern(s)"
    fi
  fi
done
```

## Integration Patterns

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Checking gitignore compliance..."
gitignore-check . || {
  echo ""
  echo "❌ Gitignore is missing security patterns."
  echo "   Run: gitignore-check . --fix"
  echo ""
  exit 1
}

echo "✅ Gitignore compliant"
```

### Make Hook Executable

```bash
chmod +x .git/hooks/pre-commit
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/security.yml
name: Security Checks

on: [push, pull_request]

jobs:
  gitignore-compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install gitignore-check
        run: |
          git clone https://github.com/nickpending/llmcli-tools.git
          cd llcli-tools
          ./install.sh gitignore-check

      - name: Check compliance
        run: |
          gitignore-check . || {
            echo "::error::Gitignore missing security patterns"
            gitignore-check . | jq '.missing'
            exit 1
          }
```

### Makefile Integration

```makefile
# Makefile

.PHONY: security-check
security-check:
	@echo "Checking gitignore compliance..."
	@gitignore-check . || (echo "Run: make security-fix" && exit 1)

.PHONY: security-fix
security-fix:
	@echo "Fixing gitignore..."
	@gitignore-check . --fix
	@echo "✅ Fixed"
```

**Usage:**
```bash
make security-check  # Check
make security-fix    # Fix
```

## Scripting Patterns

### Conditional Fix

```bash
#!/bin/bash
# Fix only if non-compliant

if ! gitignore-check . > /dev/null 2>&1; then
  echo "Non-compliant, fixing..."
  gitignore-check . --fix
else
  echo "Already compliant"
fi
```

### Notify on Slack

```bash
#!/bin/bash
# Notify Slack if non-compliant

result=$(gitignore-check .)
compliant=$(echo "$result" | jq -r '.compliant')

if [ "$compliant" = "false" ]; then
  missing=$(echo "$result" | jq -r '.missing | length')

  curl -X POST $SLACK_WEBHOOK_URL \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"⚠️ Project $(basename $PWD) missing $missing gitignore patterns\"}"
fi
```

### Track Compliance Over Time

```bash
#!/bin/bash
# Log compliance status

timestamp=$(date +%Y-%m-%d)
result=$(gitignore-check .)
compliant=$(echo "$result" | jq -r '.compliant')
missing=$(echo "$result" | jq -r '.missing | length')

echo "$timestamp,$compliant,$missing" >> compliance-log.csv
```

## Troubleshooting

### Check What Would Be Added

```bash
# See missing patterns without fixing
gitignore-check . | jq -r '.missing[]'
```

### Verify After Fix

```bash
gitignore-check . --fix
gitignore-check .  # Should show compliant: true
```

### Manual Pattern Check

```bash
# See which specific patterns are missing
gitignore-check . | jq -r '.missing[] | "Missing: \(.)"'
```

**Output:**
```
Missing: .env.*
Missing: *.key
Missing: credentials.json
```

## Common Scenarios

### Scenario 1: New TypeScript Project

```bash
npm init -y
echo "node_modules/" > .gitignore
gitignore-check . --fix
git add .
git commit -m "Initial commit with secure gitignore"
```

### Scenario 2: Inherited Project Audit

```bash
cd ~/inherited-project
gitignore-check .

# Review what's missing
gitignore-check . | jq -r '.missing[]'

# Fix if approved
gitignore-check . --fix
git diff .gitignore  # Review changes
git commit -am "Add missing gitignore security patterns"
```

### Scenario 3: Monorepo with Multiple Projects

```bash
# Check each subproject
for project in packages/*; do
  echo "Checking $project..."
  gitignore-check "$project" --fix
done
```

## Best Practices

1. **Run on new projects immediately** - Before first commit
2. **Add to pre-commit hooks** - Prevent non-compliant commits
3. **Include in CI/CD** - Catch issues in PRs
4. **Audit existing projects** - Run across all repos
5. **Review before auto-fix** - Check what will be added first

## Help

```bash
gitignore-check --help
```

Shows full usage, philosophy, and examples.

---

**Remember:** This tool enforces *minimum* security patterns. Your project may need additional ignores for project-specific files.
