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
  console.error(`
visual-image - Generate AI images via Replicate and Google

Usage:
  visual-image -m <model> -p <prompt> -o <output> [OPTIONS]

Required:
  -m, --model <model>   Model: flux, nano-banana-pro
  -p, --prompt <text>   Image generation prompt
  -o, --output <file>   Output file path

Options:
  -a, --aspect <ratio>  Aspect ratio: 1:1, 16:9, 9:16, 3:2, 2:3, etc. (default: 16:9)
  -s, --size <size>     Size for nano-banana-pro: 1K, 2K, 4K (default: 2K)
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
  model: Model;
  prompt: string;
  output: string;
  aspectRatio: AspectRatio;
  size: GeminiSize;
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
  let aspectRatio: AspectRatio = "16:9";
  let size: GeminiSize = "2K";
  let style: string | undefined;
  let raw = false;
  let verbose = false;
  let open = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === "-m" || arg === "--model") && i + 1 < args.length) {
      const m = args[++i];
      if (m === "flux" || m === "nano-banana-pro") {
        model = m;
      } else {
        console.error(
          `Error: Invalid model '${m}'. Use: flux, nano-banana-pro`,
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
      if (s === "1K" || s === "2K" || s === "4K") {
        size = s;
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

  if (!model) {
    return null;
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

  // Load config
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.log(JSON.stringify({ error: String(err) }, null, 2));
    console.error(`Error: ${err}`);
    process.exit(2);
  }

  // Build options
  const options: GenerateOptions = {
    output: parsed.output,
    aspectRatio: parsed.aspectRatio,
    size: parsed.size,
    style: parsed.style ?? config.default_style,
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
  console.error(`Generating with ${parsed.model}...`);
  const result = await generateImage(
    parsed.model,
    parsed.prompt,
    options,
    config,
  );

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
