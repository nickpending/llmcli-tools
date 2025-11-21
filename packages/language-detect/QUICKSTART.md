# language-detect Quick Start

## Basic Usage

```bash
# What languages does this project use?
language-detect .

# Just the language names
language-detect . | jq -r '.languages[]'
```

## Common Patterns

### CI/CD Integration

```bash
#!/bin/bash
# Auto-install language-specific tools

languages=$(language-detect . | jq -r '.languages[]')

for lang in $languages; do
  case $lang in
    python)
      echo "Installing Python tools..."
      uv sync
      ;;
    typescript)
      echo "Installing TypeScript tools..."
      pnpm install
      ;;
    go)
      echo "Installing Go dependencies..."
      go mod download
      ;;
  esac
done
```

### Conditional Linting

```bash
#!/bin/bash
# Only lint detected languages

if language-detect . | jq -e '.languages[] | select(. == "typescript")' > /dev/null; then
  echo "Running TypeScript checks..."
  bun tsc --noEmit
fi

if language-detect . | jq -e '.languages[] | select(. == "python")' > /dev/null; then
  echo "Running Python checks..."
  uv run ruff check .
fi
```

### Multi-language Projects

```bash
# See all languages + evidence
language-detect . | jq '.markers'

# Example output:
# {
#   "python": ["requirements.txt", "*.py files"],
#   "typescript": ["package.json", "tsconfig.json", "*.ts files"],
#   "go": ["go.mod", "*.go files"]
# }
```

## Integration with gitignore-check

language-detect is automatically called by gitignore-check to include language-specific patterns:

```bash
# gitignore-check auto-detects and includes TypeScript patterns
gitignore-check .  # Uses language-detect internally
```

## Debugging

```bash
# Full output with evidence
language-detect /path/to/project | jq '.'

# Check specific language
language-detect . | jq '.markers.typescript // "Not detected"'

# Count detected languages
language-detect . | jq '.languages | length'
```
