# language-detect

Fast, evidence-based programming language detection for projects.

## Philosophy

- **Evidence-based** - Shows WHY each language was detected (markers + file counts)
- **Fast scanning** - Checks markers first, falls back to extension counts
- **Composable output** - JSON pipes to jq, other tools, CI/CD
- **Useful standalone** - Debugging, scripts, tool integration

## Installation

```bash
# Install globally
cd packages/language-detect
bun link

# Or run directly with bun
bun language-detect.ts /path/to/project
```

## Usage

```bash
# Detect languages in current directory
language-detect .

# Detect in specific project
language-detect /path/to/project

# List detected languages only
language-detect . | jq -r '.languages[]'

# Show evidence for specific language
language-detect . | jq '.markers.typescript'

# Check if project uses Go
language-detect . | jq -e '.languages[] | select(. == "go")'
```

## Detection Strategy

### Phase 1: Marker files (fast, reliable)
- Python: pyproject.toml, requirements.txt, setup.py, Pipfile
- JavaScript/TypeScript: package.json, tsconfig.json
- Go: go.mod, go.sum
- Rust: Cargo.toml, Cargo.lock
- Ruby: Gemfile, Gemfile.lock
- etc.

### Phase 2: Extension fallback (when no markers)
- Counts files with language extensions (.ts, .py, .go, etc.)
- Configurable threshold (default: any files detected)
- Scans up to 3 directory levels deep
- Skips hidden directories for performance

## Output Format

```json
{
  "languages": ["typescript"],
  "markers": {
    "typescript": ["7 *.ts files"]
  }
}
```

## Supported Languages

- Python
- JavaScript
- TypeScript
- Go
- Rust
- Ruby
- Java
- C#
- PHP
- Swift
- Kotlin
- Scala

## Configuration

Edit `EXTENSION_THRESHOLD` in language-detect.ts:
- `0` = detect any files (default)
- `3` = need 3+ files
- Higher values = more conservative detection

## Exit Codes

- `0` - Success (languages detected or none found)
- `2` - Error (invalid args, directory not found)
