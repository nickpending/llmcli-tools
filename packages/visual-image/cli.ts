#!/usr/bin/env bun
/**
 * visual-image CLI
 *
 * Generate AI images via Replicate (flux) and Google (nano-banana-pro).
 *
 * Usage:
 *   visual-image -m flux -p "developer workspace at night" -o image.png
 *   visual-image -m nano-banana-pro -p "abstract art" -o art.png --style tokyo-noir
 *
 * Exit codes:
 *   0 - Success
 *   1 - Generation error (API failed, file not created)
 *   2 - Client error (missing args, invalid options)
 */

import {
  generateImage,
  loadConfig,
  STYLE_PRESETS,
  AVAILABLE_MODELS,
  AVAILABLE_SIZES,
  type Model,
  type AspectRatio,
  type GeminiSize,
  type GenerateOptions,
} from "./index";

// ============================================================================
// Help Text
// ============================================================================

function printUsage(): void {
  const styles = Object.keys(STYLE_PRESETS).join(", ");
  const models = AVAILABLE_MODELS.join(", ");
  const sizes = AVAILABLE_SIZES.join(", ");
  console.error(`
visual-image - Generate AI images via Replicate and Google

Usage:
  visual-image -p <prompt> -o <output> [OPTIONS]

Required:
  -p, --prompt <text>   Image generation prompt
  -o, --output <file>   Output file path

Options:
  -m, --model <model>   Model: ${models} (default: from config)
  -a, --aspect <ratio>  Aspect ratio: 1:1, 16:9, 9:16, 3:2, 2:3, etc. (default: from config)
  -s, --size <size>     Size for nano-banana-pro: ${sizes} (default: from config)
  --style <name>        Style preset: ${styles}, none (default: from config)
  --raw                 Skip style injection (use prompt as-is)
  --verbose             Show final prompt with style applied
  --open                Open output file after generation (macOS)
  -h, --help            Show this help

Models:
  flux              Replicate's Flux 1.1 Pro - fast, high quality
  nano-banana-pro   Google Gemini 3 Pro - excellent for illustrations

Examples:
  # Generate with Flux
  visual-image -m flux -p "developer workspace at night" -o hero.png

  # Generate with nano-banana-pro and tokyo-noir style
  visual-image -m nano-banana-pro -p "city street" -o city.png --style tokyo-noir

  # Generate wireframe mockup
  visual-image -m nano-banana-pro -p "admin dashboard" -o wireframe.png --style wireframe

  # Raw prompt without style injection
  visual-image -m flux -p "detailed prompt here" -o output.png --raw

  # Open result in Preview
  visual-image -m flux -p "landscape" -o landscape.png --open

Environment:
  API keys loaded from ~/.config/llm/.env
  - REPLICATE_API_TOKEN (for flux)
  - GOOGLE_API_KEY (for nano-banana-pro)

Config:
  Tool settings from ~/.config/visual-image/config.toml
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  model?: Model;
  prompt: string;
  output: string;
  aspectRatio?: AspectRatio;
  size?: GeminiSize;
  style?: string;
  raw: boolean;
  verbose: boolean;
  open: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return null;
  }

  let model: Model | undefined;
  let prompt = "";
  let output = "";
  let aspectRatio: AspectRatio | undefined;
  let size: GeminiSize | undefined;
  let style: string | undefined;
  let raw = false;
  let verbose = false;
  let open = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === "-m" || arg === "--model") && i + 1 < args.length) {
      const m = args[++i];
      if (AVAILABLE_MODELS.includes(m as Model)) {
        model = m as Model;
      } else {
        console.error(
          `Error: Invalid model '${m}'. Use: ${AVAILABLE_MODELS.join(", ")}`,
        );
        process.exit(2);
      }
    } else if ((arg === "-p" || arg === "--prompt") && i + 1 < args.length) {
      prompt = args[++i];
    } else if ((arg === "-o" || arg === "--output") && i + 1 < args.length) {
      output = args[++i];
    } else if ((arg === "-a" || arg === "--aspect") && i + 1 < args.length) {
      aspectRatio = args[++i] as AspectRatio;
    } else if ((arg === "-s" || arg === "--size") && i + 1 < args.length) {
      const s = args[++i];
      if (AVAILABLE_SIZES.includes(s as GeminiSize)) {
        size = s as GeminiSize;
      } else {
        console.error(
          `Error: Invalid size '${s}'. Use: ${AVAILABLE_SIZES.join(", ")}`,
        );
        process.exit(2);
      }
    } else if (arg === "--style" && i + 1 < args.length) {
      style = args[++i];
    } else if (arg === "--raw") {
      raw = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--open") {
      open = true;
    }
  }

  return {
    model,
    prompt,
    output,
    aspectRatio,
    size,
    style,
    raw,
    verbose,
    open,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed) {
    printUsage();
    process.exit(0);
  }

  // Load config first (need defaults)
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.log(JSON.stringify({ error: String(err) }, null, 2));
    console.error(`Error: ${err}`);
    process.exit(2);
  }

  // Validate required args
  if (!parsed.prompt) {
    console.log(JSON.stringify({ error: "Prompt required (-p)" }, null, 2));
    console.error("Error: Prompt required (-p)");
    process.exit(2);
  }

  if (!parsed.output) {
    console.log(
      JSON.stringify({ error: "Output path required (-o)" }, null, 2),
    );
    console.error("Error: Output path required (-o)");
    process.exit(2);
  }

  // Merge CLI args with config defaults
  const model = parsed.model ?? config.default_model;
  const aspectRatio = parsed.aspectRatio ?? config.default_aspect_ratio;
  const size = parsed.size ?? config.default_size;
  const style = parsed.style ?? config.default_style;

  // Build options
  const options: GenerateOptions = {
    output: parsed.output,
    aspectRatio,
    size,
    style,
    raw: parsed.raw,
  };

  // Verbose mode: show final prompt
  if (parsed.verbose) {
    const styleName = options.style ?? "none";
    if (!parsed.raw && styleName !== "none" && STYLE_PRESETS[styleName]) {
      const styleInfo = STYLE_PRESETS[styleName];
      console.error(`Style: ${styleName}`);
      console.error(`Final prompt: ${parsed.prompt}, ${styleInfo.positive}`);
      if (styleInfo.negative) {
        console.error(`Negative: ${styleInfo.negative}`);
      }
    } else {
      console.error(`Prompt: ${parsed.prompt}`);
    }
  }

  // Generate
  console.error(`Generating with ${model}...`);
  const result = await generateImage(model, parsed.prompt, options, config);

  // Output JSON
  console.log(JSON.stringify(result, null, 2));

  if (result.path) {
    console.error(`✅ Generated: ${result.path}`);

    // Open if requested (macOS)
    if (parsed.open) {
      try {
        Bun.spawn(["open", result.path], {
          stdout: "ignore",
          stderr: "ignore",
        });
      } catch {
        console.error("⚠️  Could not open file");
      }
    }

    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }
}

main();
