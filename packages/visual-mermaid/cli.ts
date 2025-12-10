#!/usr/bin/env bun
/**
 * visual-mermaid CLI
 *
 * Render Mermaid diagrams to PNG/SVG with terminal-noir theming.
 *
 * Usage:
 *   visual-mermaid --code "flowchart TD; A-->B" -o diagram.png
 *   visual-mermaid -i diagram.mmd -o diagram.png
 *   cat diagram.mmd | visual-mermaid -o diagram.png
 *
 * Exit codes:
 *   0 - Success
 *   1 - Render error (mmdc failed, file not created)
 *   2 - Client error (missing args, invalid options)
 */

import { readFileSync, existsSync } from "fs";
import {
  renderMermaid,
  TERMINAL_NOIR_THEME,
  type RenderOptions,
} from "./index";

// ============================================================================
// Stdin Reading
// ============================================================================

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

// ============================================================================
// Help Text
// ============================================================================

function printUsage(): void {
  console.error(`
visual-mermaid - Render Mermaid diagrams to PNG/SVG

Usage:
  visual-mermaid --code "flowchart TD; A-->B" -o output.png
  visual-mermaid -i input.mmd -o output.png
  cat diagram.mmd | visual-mermaid -o output.png

Options:
  --code <text>       Mermaid diagram code (inline)
  -i, --input <file>  Input .mmd file
  -o, --output <file> Output file (required)
  -f, --format <fmt>  Output format: png, svg, pdf (default: from extension)
  -w, --width <n>     Width in pixels
  -H, --height <n>    Height in pixels
  -b, --background    Background color (default: transparent)
  --theme <name>      Theme: terminal-noir, dark, default (default: dark)
  --open              Open output file after rendering (macOS)
  -h, --help          Show this help

Input priority:
  1. --code flag (inline code)
  2. -i/--input file
  3. stdin (if piped)

Examples:
  # Inline code
  visual-mermaid --code "flowchart TD; A-->B" -o /tmp/flow.png

  # From file
  visual-mermaid -i diagram.mmd -o diagram.png

  # From stdin
  echo "flowchart TD; A-->B" | visual-mermaid -o /tmp/flow.png

  # With terminal-noir theme
  visual-mermaid --code "flowchart TD; A-->B" -o flow.png --theme terminal-noir
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  code: string;
  output: string;
  format?: "png" | "svg" | "pdf";
  width?: number;
  height?: number;
  background?: string;
  theme?: string;
  open: boolean;
}

async function parseArgs(argv: string[]): Promise<ParsedArgs | null> {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return null;
  }

  let code = "";
  let input = "";
  let output = "";
  let format: "png" | "svg" | "pdf" | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let background: string | undefined;
  let theme: string | undefined;
  let open = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--code" && i + 1 < args.length) {
      code = args[++i];
    } else if ((arg === "-i" || arg === "--input") && i + 1 < args.length) {
      input = args[++i];
    } else if ((arg === "-o" || arg === "--output") && i + 1 < args.length) {
      output = args[++i];
    } else if ((arg === "-f" || arg === "--format") && i + 1 < args.length) {
      const f = args[++i];
      if (f === "png" || f === "svg" || f === "pdf") {
        format = f;
      }
    } else if ((arg === "-w" || arg === "--width") && i + 1 < args.length) {
      width = parseInt(args[++i], 10);
    } else if ((arg === "-H" || arg === "--height") && i + 1 < args.length) {
      height = parseInt(args[++i], 10);
    } else if (
      (arg === "-b" || arg === "--background") &&
      i + 1 < args.length
    ) {
      background = args[++i];
    } else if (arg === "--theme" && i + 1 < args.length) {
      theme = args[++i];
    } else if (arg === "--open") {
      open = true;
    }
  }

  // Resolve code from input sources
  if (!code && input) {
    if (!existsSync(input)) {
      console.error(`Error: Input file not found: ${input}`);
      process.exit(2);
    }
    code = readFileSync(input, "utf-8");
  }

  // Check for stdin if no code yet
  if (!code) {
    const isTTY = process.stdin.isTTY;
    if (!isTTY) {
      code = await readStdin();
    }
  }

  return {
    code,
    output,
    format,
    width,
    height,
    background,
    theme,
    open,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const parsed = await parseArgs(process.argv);

  if (!parsed) {
    printUsage();
    process.exit(0);
  }

  // Validate required args
  if (!parsed.output) {
    console.log(
      JSON.stringify({ error: "Output path required (-o)" }, null, 2),
    );
    console.error("Error: Output path required (-o)");
    process.exit(2);
  }

  if (!parsed.code) {
    console.log(
      JSON.stringify(
        { error: "No input provided (--code, -i, or stdin)" },
        null,
        2,
      ),
    );
    console.error("Error: No input provided (--code, -i, or stdin)");
    process.exit(2);
  }

  // Build render options
  const options: RenderOptions = {
    output: parsed.output,
    format: parsed.format,
    width: parsed.width,
    height: parsed.height,
    backgroundColor: parsed.background,
  };

  // Apply theme
  if (parsed.theme === "terminal-noir") {
    options.theme = TERMINAL_NOIR_THEME;
  }

  // Render
  const result = await renderMermaid(parsed.code, options);

  // Output JSON
  console.log(JSON.stringify(result, null, 2));

  if (result.path) {
    console.error(`✅ Rendered: ${result.path}`);

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
