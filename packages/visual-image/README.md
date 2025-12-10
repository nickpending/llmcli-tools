# visual-image

AI image generation via Replicate (Flux) and Google (nano-banana-pro).

## Philosophy

- **Multi-provider** - Flux 1.1 Pro via Replicate, Gemini 3 Pro via Google
- **Style presets** - tokyo-noir (Blade Runner), wireframe (technical mockups)
- **Shared secrets** - API keys in `~/.config/llm/.env` with all llmcli-tools
- **Composable** - JSON output pipes to jq and other tools

## Installation

```bash
cd packages/visual-image
bun link
```

## Configuration

### Step 1: Copy config file

```bash
mkdir -p ~/.config/visual-image
cp config.example.toml ~/.config/visual-image/config.toml
```

### Step 2: Add API keys to shared .env

Add to `~/.config/llm/.env`:

```bash
# For flux model (Replicate)
REPLICATE_API_TOKEN=r8_...  # https://replicate.com/account/api-tokens

# For nano-banana-pro model (Google)
GOOGLE_API_KEY=AIza...      # https://aistudio.google.com/apikey
```

### Config file: `~/.config/visual-image/config.toml`

```toml
default_model = "flux"
default_output_dir = "~/.local/share/visual-image/output"
default_style = "none"
default_aspect_ratio = "16:9"
default_size = "2K"
```

## Usage

```bash
# Generate with Flux
visual-image -m flux -p "developer workspace at night" -o hero.png

# Generate with nano-banana-pro
visual-image -m nano-banana-pro -p "abstract digital art" -o art.png

# Apply tokyo-noir style
visual-image -m flux -p "city street" -o city.png --style tokyo-noir

# Generate wireframe mockup
visual-image -m nano-banana-pro -p "admin dashboard" -o wireframe.png --style wireframe

# Raw prompt (skip style injection)
visual-image -m flux -p "detailed prompt here" -o output.png --raw

# Show final prompt with style applied
visual-image -m flux -p "test" -o test.png --style tokyo-noir --verbose

# Open in Preview (macOS)
visual-image -m flux -p "landscape" -o landscape.png --open
```

## Options

| Flag | Description |
|------|-------------|
| `-m, --model <model>` | Model: flux, nano-banana-pro (required) |
| `-p, --prompt <text>` | Image generation prompt (required) |
| `-o, --output <file>` | Output file path (required) |
| `-a, --aspect <ratio>` | Aspect ratio: 1:1, 16:9, 9:16, etc. |
| `-s, --size <size>` | Size for nano-banana-pro: 1K, 2K, 4K |
| `--style <name>` | Style preset: tokyo-noir, wireframe, none |
| `--raw` | Skip style injection |
| `--verbose` | Show final prompt with style |
| `--open` | Open output file (macOS) |
| `-h, --help` | Show help |

## Output

```json
{
  "path": "/absolute/path/to/image.png",
  "model": "flux"
}
```

On error:
```json
{
  "error": "REPLICATE_API_TOKEN not found. Add to ~/.config/llm/.env"
}
```

## Models

| Model | Provider | Best For |
|-------|----------|----------|
| `flux` | Replicate | Fast, high-quality photorealistic |
| `nano-banana-pro` | Google | Illustrations, artistic styles |

## Style Presets

| Style | Description |
|-------|-------------|
| `tokyo-noir` | Blade Runner aesthetic, desaturated, cyan/purple neon |
| `wireframe` | Clean technical mockup, white lines on dark background |
| `none` | No style injection (default) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Generation error (API failed, file not created) |
| 2 | Client error (missing args, invalid options) |
