/**
 * visual-mermaid - Library exports
 *
 * Render Mermaid diagrams to PNG/SVG with terminal-noir theming.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { renderMermaid } from "visual-mermaid";
 *   const result = await renderMermaid("flowchart TD; A-->B", { output: "/tmp/diagram.png" });
 */

import {
  existsSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface RenderOptions {
  output: string;
  format?: "png" | "svg" | "pdf";
  width?: number;
  height?: number;
  backgroundColor?: string;
  theme?: MermaidTheme;
}

export interface RenderResult {
  path?: string;
  error?: string;
}

export interface MermaidTheme {
  theme: "base" | "default" | "dark" | "forest" | "neutral";
  themeVariables?: Record<string, string>;
}

export interface MermaidConfig {
  theme: string;
  themeVariables?: Record<string, string>;
  backgroundColor?: string;
}

export interface MermaidToolConfig {
  theme: string;
  background: string;
  format: "png" | "svg" | "pdf";
  width: number;
  height: number;
  output_dir: string;
}

// ============================================================================
// Theme Definitions
// ============================================================================

/**
 * Terminal Noir theme - dark terminal aesthetic
 * Colors from terminal-noir spec:
 * - Deep background: #0a0e14
 * - Card background: #0f1419
 * - Primary cyan: #00D9FF
 * - Accent magenta: #FF00FF
 */
export const TERMINAL_NOIR_THEME: MermaidTheme = {
  theme: "base",
  themeVariables: {
    primaryColor: "#0f1419",
    primaryTextColor: "#e6e6e6",
    primaryBorderColor: "#00D9FF",
    lineColor: "#00D9FF",
    secondaryColor: "#1a1f26",
    tertiaryColor: "#0a0e14",
    background: "#0a0e14",
    mainBkg: "#0f1419",
    nodeBorder: "#00D9FF",
    clusterBkg: "#0a0e14",
    clusterBorder: "#00D9FF",
    titleColor: "#00D9FF",
    edgeLabelBackground: "#0f1419",
    textColor: "#e6e6e6",
    nodeTextColor: "#e6e6e6",
  },
};

export const BACKGROUNDS = {
  transparent: "transparent",
  deep: "#0a0e14",
  card: "#0f1419",
} as const;

export type BackgroundOption = keyof typeof BACKGROUNDS;

export const THEMES: Record<string, MermaidTheme> = {
  "terminal-noir": TERMINAL_NOIR_THEME,
};

/**
 * Get theme configuration for mmdc
 * @param themeName - Theme name (currently only "terminal-noir")
 * @param background - Background option: "transparent", "deep", or "card"
 * @returns MermaidConfig for mmdc --configFile
 */
export function getThemeConfig(
  themeName: string = "terminal-noir",
  background: BackgroundOption = "deep",
): MermaidConfig {
  const theme = THEMES[themeName];
  if (!theme) {
    throw new Error(
      `Unknown theme: ${themeName}. Available: ${Object.keys(THEMES).join(", ")}`,
    );
  }

  return {
    theme: theme.theme,
    themeVariables: theme.themeVariables,
    backgroundColor: BACKGROUNDS[background],
  };
}

// ============================================================================
// Configuration
// ============================================================================

const EXAMPLE_CONFIG = `# visual-mermaid configuration
# Place at: ~/.config/visual-mermaid/config.toml

theme = "terminal-noir"
background = "#0a0e14"
format = "png"
width = 1200
height = 800
output_dir = "~/.local/share/visual-mermaid/output"
`;

/**
 * Load configuration from ~/.config/visual-mermaid/config.toml
 * Throws with helpful message if config file is missing
 */
export function loadConfig(): MermaidToolConfig {
  const configPath = join(
    process.env.HOME!,
    ".config",
    "visual-mermaid",
    "config.toml",
  );

  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\n\nCreate it with:\n\n${EXAMPLE_CONFIG}`,
    );
  }

  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read config: ${configPath}\n${String(err)}`);
  }

  // Parse with regex (flat TOML key-value pairs)
  const themeMatch = content.match(/^\s*theme\s*=\s*"([^"]+)"/m);
  const backgroundMatch = content.match(/^\s*background\s*=\s*"([^"]+)"/m);
  const formatMatch = content.match(/^\s*format\s*=\s*"([^"]+)"/m);
  const widthMatch = content.match(/^\s*width\s*=\s*(\d+)/m);
  const heightMatch = content.match(/^\s*height\s*=\s*(\d+)/m);
  const outputDirMatch = content.match(/^\s*output_dir\s*=\s*"([^"]+)"/m);

  // Validate required fields
  if (!themeMatch) {
    throw new Error(
      `Missing required field 'theme' in ${configPath}\n\nExample:\n${EXAMPLE_CONFIG}`,
    );
  }

  // Build config with defaults for optional fields
  const config: MermaidToolConfig = {
    theme: themeMatch[1],
    background: backgroundMatch?.[1] ?? "#0a0e14",
    format: (formatMatch?.[1] as "png" | "svg" | "pdf") ?? "png",
    width: widthMatch ? parseInt(widthMatch[1], 10) : 1200,
    height: heightMatch ? parseInt(heightMatch[1], 10) : 800,
    output_dir: outputDirMatch?.[1] ?? "~/.local/share/visual-mermaid/output",
  };

  // Resolve ~ in output_dir
  if (config.output_dir.startsWith("~")) {
    config.output_dir = config.output_dir.replace("~", process.env.HOME!);
  }

  return config;
}

// ============================================================================
// Core Implementation
// ============================================================================

/**
 * Find mmdc binary path
 */
function findMmdc(): string | null {
  const possiblePaths = [
    join(process.cwd(), "node_modules", ".bin", "mmdc"),
    join(dirname(process.cwd()), "..", "node_modules", ".bin", "mmdc"),
  ];

  // Check package-local first
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fall back to global
  return "mmdc";
}

/**
 * Create temporary config file for mmdc
 * Structure: https://mermaid.js.org/config/schema-docs/config.html
 */
function createTempConfig(options: RenderOptions): string {
  // mmdc config wraps mermaid config at top level
  const config: Record<string, unknown> = {
    theme: options.theme?.theme || "dark",
  };

  if (options.theme?.themeVariables) {
    config.themeVariables = options.theme.themeVariables;
  }

  const tempPath = join(tmpdir(), `mermaid-config-${Date.now()}.json`);
  writeFileSync(tempPath, JSON.stringify(config, null, 2));
  return tempPath;
}

/**
 * Render Mermaid diagram to file
 *
 * @param code - Mermaid diagram code
 * @param options - Render options including output path
 * @returns RenderResult with path or error
 */
export async function renderMermaid(
  code: string,
  options: RenderOptions,
): Promise<RenderResult> {
  const mmdc = findMmdc();
  if (!mmdc) {
    return {
      error: "mmdc not found. Install with: bun add @mermaid-js/mermaid-cli",
    };
  }

  // Ensure output directory exists
  const outputDir = dirname(options.output);
  if (!existsSync(outputDir)) {
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      return {
        error: `Failed to create output directory: ${outputDir}`,
      };
    }
  }

  // Create temp files
  const tempInput = join(tmpdir(), `mermaid-input-${Date.now()}.mmd`);
  const tempConfig = createTempConfig(options);

  try {
    // Write input file
    writeFileSync(tempInput, code);

    // Build command args
    const args = ["-i", tempInput, "-o", options.output, "-c", tempConfig];

    if (options.format) {
      args.push("-e", options.format);
    }

    if (options.width) {
      args.push("-w", String(options.width));
    }

    if (options.height) {
      args.push("-H", String(options.height));
    }

    if (options.backgroundColor) {
      args.push("-b", options.backgroundColor);
    }

    // Run mmdc
    const proc = Bun.spawn([mmdc, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      return {
        error: `mmdc failed (exit ${exitCode}): ${stderr.trim() || "Unknown error"}`,
      };
    }

    // Verify output file exists
    if (!existsSync(options.output)) {
      return {
        error: `mmdc completed but output file not found: ${options.output}`,
      };
    }

    return {
      path: options.output,
    };
  } catch (err) {
    return {
      error: `Render failed: ${String(err)}`,
    };
  } finally {
    // Cleanup temp files
    try {
      if (existsSync(tempInput)) unlinkSync(tempInput);
      if (existsSync(tempConfig)) unlinkSync(tempConfig);
    } catch {
      // Ignore cleanup errors
    }
  }
}
