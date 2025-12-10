/**
 * visual-image - Library exports
 *
 * Generate AI images via Replicate (flux) and Google (nano-banana-pro).
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { generateImage, loadConfig } from "visual-image";
 *   const result = await generateImage("flux", "developer workspace", { output: "/tmp/image.png" });
 */

import Replicate from "replicate";
import { GoogleGenAI } from "@google/genai";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ============================================================================
// Types
// ============================================================================

export type Model = "flux" | "nano-banana-pro";

export const AVAILABLE_MODELS: Model[] = ["flux", "nano-banana-pro"];

export type AspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "3:2"
  | "2:3"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "21:9";

export type GeminiSize = "1K" | "2K" | "4K";

export const AVAILABLE_SIZES: GeminiSize[] = ["1K", "2K", "4K"];

export interface GenerateOptions {
  output: string;
  aspectRatio?: AspectRatio;
  size?: GeminiSize;
  raw?: boolean;
  style?: string;
}

export interface GenerateResult {
  path?: string;
  model?: Model;
  error?: string;
}

export interface ImageToolConfig {
  default_model: Model;
  default_output_dir: string;
  default_style: string;
  default_aspect_ratio: AspectRatio;
  default_size: GeminiSize;
  replicate_api_token: string;
  google_api_key: string;
}

export interface StylePreset {
  name: string;
  positive: string;
  negative?: string;
}

// ============================================================================
// Style Presets
// ============================================================================

export const STYLE_PRESETS: Record<string, StylePreset> = {
  "tokyo-noir": {
    name: "tokyo-noir",
    positive:
      "tokyo noir aesthetic, blade runner 2049 style, desaturated colors, rain-soaked streets, cyan and purple neon accents, moody atmospheric lighting, cinematic composition",
    negative: "bright colors, daylight, cheerful, cartoon, anime",
  },
  wireframe: {
    name: "wireframe",
    positive:
      "clean technical wireframe mockup, dark background, white lines and shapes, minimalist UI design, no decoration, professional interface sketch",
    negative: "color, gradient, realistic, 3D, photographs",
  },
};

// ============================================================================
// Configuration
// ============================================================================

const EXAMPLE_CONFIG = `# visual-image configuration
# Place at: ~/.config/visual-image/config.toml

default_model = "flux"
default_output_dir = "~/.local/share/visual-image/output"
default_style = "none"
default_aspect_ratio = "16:9"
default_size = "2K"

# API keys loaded from shared ~/.config/llm/.env
# REPLICATE_API_TOKEN=...
# GOOGLE_API_KEY=...
`;

/**
 * Load .env file and set environment variables
 */
async function loadEnvFile(envPath: string): Promise<void> {
  if (!existsSync(envPath)) return;

  try {
    const content = await readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore read errors
  }
}

/**
 * Load configuration from ~/.config/visual-image/config.toml
 * Also loads API keys from ~/.config/llm/.env
 */
export async function loadConfig(): Promise<ImageToolConfig> {
  const home = process.env.HOME!;

  // Load shared API keys first
  await loadEnvFile(join(home, ".config", "llm", ".env"));

  const configPath = join(home, ".config", "visual-image", "config.toml");

  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\n\nCreate it with:\n\n${EXAMPLE_CONFIG}`,
    );
  }

  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read config: ${configPath}\n${String(err)}`);
  }

  // Parse with regex (flat TOML key-value pairs)
  const defaultModelMatch = content.match(/^\s*default_model\s*=\s*"([^"]+)"/m);
  const outputDirMatch = content.match(
    /^\s*default_output_dir\s*=\s*"([^"]+)"/m,
  );
  const styleMatch = content.match(/^\s*default_style\s*=\s*"([^"]+)"/m);
  const aspectRatioMatch = content.match(
    /^\s*default_aspect_ratio\s*=\s*"([^"]+)"/m,
  );
  const sizeMatch = content.match(/^\s*default_size\s*=\s*"([^"]+)"/m);

  // Build config with defaults
  const config: ImageToolConfig = {
    default_model: (defaultModelMatch?.[1] as Model) ?? "flux",
    default_output_dir:
      outputDirMatch?.[1] ?? "~/.local/share/visual-image/output",
    default_style: styleMatch?.[1] ?? "none",
    default_aspect_ratio: (aspectRatioMatch?.[1] as AspectRatio) ?? "16:9",
    default_size: (sizeMatch?.[1] as GeminiSize) ?? "2K",
    replicate_api_token: process.env.REPLICATE_API_TOKEN ?? "",
    google_api_key: process.env.GOOGLE_API_KEY ?? "",
  };

  // Resolve ~ in output_dir
  if (config.default_output_dir.startsWith("~")) {
    config.default_output_dir = config.default_output_dir.replace("~", home);
  }

  return config;
}

// ============================================================================
// Style Injection
// ============================================================================

/**
 * Apply style preset to prompt
 */
export function applyStyle(
  prompt: string,
  styleName: string,
  raw: boolean = false,
): { finalPrompt: string; negativePrompt?: string } {
  if (raw || styleName === "none" || !STYLE_PRESETS[styleName]) {
    return { finalPrompt: prompt };
  }

  const style = STYLE_PRESETS[styleName];
  return {
    finalPrompt: `${prompt}, ${style.positive}`,
    negativePrompt: style.negative,
  };
}

// ============================================================================
// Providers
// ============================================================================

/**
 * Generate image with Flux via Replicate
 */
async function generateWithFlux(
  prompt: string,
  options: GenerateOptions,
  apiToken: string,
): Promise<GenerateResult> {
  if (!apiToken) {
    return {
      error:
        "REPLICATE_API_TOKEN not found. Add to ~/.config/llm/.env:\nREPLICATE_API_TOKEN=your_token_here",
    };
  }

  const replicate = new Replicate({ auth: apiToken });
  const aspectRatio = options.aspectRatio ?? "16:9";

  try {
    const result = await replicate.run("black-forest-labs/flux-1.1-pro", {
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: "png",
        output_quality: 95,
        prompt_upsampling: false,
      },
    });

    // Ensure output directory exists
    const outputDir = dirname(options.output);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write image buffer
    await writeFile(options.output, result as Buffer);

    return {
      path: resolve(options.output),
      model: "flux",
    };
  } catch (err) {
    return {
      error: `Flux generation failed: ${String(err)}`,
    };
  }
}

/**
 * Generate image with nano-banana-pro via Google Gemini
 */
async function generateWithNanoBananaPro(
  prompt: string,
  options: GenerateOptions,
  apiKey: string,
): Promise<GenerateResult> {
  if (!apiKey) {
    return {
      error:
        "GOOGLE_API_KEY not found. Add to ~/.config/llm/.env:\nGOOGLE_API_KEY=your_key_here",
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const aspectRatio = options.aspectRatio ?? "16:9";
  const size = options.size ?? "2K";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio,
          imageSize: size,
        },
      },
    });

    // Extract image data from response
    let imageData: string | undefined;

    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && (part.inlineData as { data?: string }).data) {
            imageData = (part.inlineData as { data: string }).data;
            break;
          }
        }
      }
    }

    if (!imageData) {
      return {
        error: "No image data returned from Gemini API",
      };
    }

    // Ensure output directory exists
    const outputDir = dirname(options.output);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write image buffer
    const imageBuffer = Buffer.from(imageData, "base64");
    await writeFile(options.output, imageBuffer);

    return {
      path: resolve(options.output),
      model: "nano-banana-pro",
    };
  } catch (err) {
    return {
      error: `nano-banana-pro generation failed: ${String(err)}`,
    };
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Generate AI image using specified model
 *
 * @param model - Model to use: "flux" or "nano-banana-pro"
 * @param prompt - Image generation prompt
 * @param options - Generation options including output path
 * @param config - Optional pre-loaded config (will load if not provided)
 * @returns GenerateResult with path or error
 */
export async function generateImage(
  model: Model,
  prompt: string,
  options: GenerateOptions,
  config?: ImageToolConfig,
): Promise<GenerateResult> {
  // Load config if not provided
  const cfg = config ?? (await loadConfig());

  // Apply style if not raw
  const styleName = options.style ?? cfg.default_style;
  const { finalPrompt } = applyStyle(prompt, styleName, options.raw);

  // Route to provider
  switch (model) {
    case "flux":
      return generateWithFlux(finalPrompt, options, cfg.replicate_api_token);
    case "nano-banana-pro":
      return generateWithNanoBananaPro(
        finalPrompt,
        options,
        cfg.google_api_key,
      );
    default:
      return {
        error: `Unknown model: ${model}. Available: flux, nano-banana-pro`,
      };
  }
}
