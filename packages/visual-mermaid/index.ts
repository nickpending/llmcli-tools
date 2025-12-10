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

import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "fs";
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
