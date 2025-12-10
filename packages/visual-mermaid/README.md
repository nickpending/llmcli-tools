# visual-mermaid

Render Mermaid diagrams to PNG/SVG with terminal-noir theming.

## Philosophy

- **Config-driven** - Theme, dimensions, output format from config file
- **Terminal-noir** - Cyan/slate color palette designed for dark backgrounds
- **Composable** - JSON output pipes to jq and other tools
- **Multiple inputs** - Inline code, file, or stdin

## Installation

```bash
cd packages/visual-mermaid
bun link
```

Requires mmdc (mermaid-cli) installed:
```bash
npm install -g @mermaid-js/mermaid-cli
```

## Configuration

Copy `config.example.toml` to `~/.config/visual-mermaid/config.toml`:

```bash
cp config.example.toml ~/.config/visual-mermaid/config.toml
```

### Config file: `~/.config/visual-mermaid/config.toml`

```toml
theme = "terminal-noir"
background = "#0a0e14"
format = "png"
width = 1200
height = 800
output_dir = "~/.local/share/visual-mermaid/output"
```

## Usage

```bash
# Inline code
visual-mermaid --code "flowchart TD; A-->B" -o diagram.png

# From file
visual-mermaid -i diagram.mmd -o output.png

# From stdin
cat diagram.mmd | visual-mermaid -o flow.png

# With theme override
visual-mermaid --code "graph LR; A-->B" -o diagram.png --theme terminal-noir

# Open in Preview (macOS)
visual-mermaid --code "flowchart TD; A-->B" -o diagram.png --open
```

## Options

| Flag | Description |
|------|-------------|
| `--code <text>` | Mermaid diagram code (inline) |
| `-i, --input <file>` | Input .mmd file |
| `-o, --output <file>` | Output file (required) |
| `-f, --format <fmt>` | Output format: png, svg, pdf |
| `-w, --width <n>` | Width in pixels |
| `-H, --height <n>` | Height in pixels |
| `-b, --background <color>` | Background color |
| `--theme <name>` | Theme: terminal-noir, dark, default |
| `--open` | Open output file (macOS) |
| `-h, --help` | Show help |

## Output

```json
{
  "path": "/absolute/path/to/diagram.png"
}
```

On error:
```json
{
  "error": "mmdc not found. Install with: npm install -g @mermaid-js/mermaid-cli"
}
```

## Themes

| Theme | Description |
|-------|-------------|
| `terminal-noir` | Cyan accents on deep slate (#0a0e14) |
| `dark` | Default mermaid dark theme |
| `default` | Vanilla mermaid styling |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Render error (mmdc failed) |
| 2 | Client error (missing args, invalid options) |
