/**
 * Prismis API integration
 *
 * Queries prismis daemon REST API for semantic search across content.
 * Reads host and API key from ~/.config/prismis/config.toml
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Local interface to avoid bun:sqlite dependency from search.ts
export interface PrismisSearchResult {
  source: string;
  title: string;
  content: string;
  metadata: string;
  rank: number;
}

const DEFAULT_PORT = 8989;
const PRISMIS_CONFIG_PATH = join(
  process.env.HOME ?? "",
  ".config",
  "prismis",
  "config.toml",
);

export interface PrismisSearchOptions {
  limit?: number;
}

interface PrismisConfig {
  host: string;
  apiKey: string;
}

interface PrismisItem {
  id: string;
  title: string;
  url: string;
  priority: string;
  relevance_score: number;
  published_at: string;
  source_name: string;
  summary: string;
}

interface PrismisResponse {
  success: boolean;
  message: string;
  data: {
    items: PrismisItem[];
    total: number;
  };
}

/**
 * Read prismis config from config.toml
 */
function readPrismisConfig(): PrismisConfig {
  if (!existsSync(PRISMIS_CONFIG_PATH)) {
    throw new Error(
      `Prismis config not found at ${PRISMIS_CONFIG_PATH}. ` +
        "Install prismis and run: prismis-cli source add <url>",
    );
  }

  const content = readFileSync(PRISMIS_CONFIG_PATH, "utf-8");

  // Parse [api] section
  const keyMatch = content.match(/\[api\][^[]*key\s*=\s*"([^"]+)"/);
  if (!keyMatch) {
    throw new Error(
      "Prismis API key not found in config.toml. Add [api] key=... to config.",
    );
  }

  const hostMatch = content.match(/\[api\][^[]*host\s*=\s*"([^"]+)"/);
  let host = hostMatch?.[1] ?? "localhost";

  // Map server bind addresses to client-usable addresses
  if (host === "0.0.0.0" || host === "127.0.0.1") {
    host = "localhost";
  }

  return {
    host,
    apiKey: keyMatch[1],
  };
}

/**
 * Check if prismis daemon is running
 */
async function checkPrismisDaemon(apiBase: string): Promise<void> {
  try {
    const response = await fetch(`${apiBase}/health`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      throw new Error("Prismis daemon unhealthy");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `Prismis daemon not responding at ${apiBase}. Start with: prismis-daemon`,
      );
    }
    throw new Error(
      `Prismis daemon not running at ${apiBase}. Start with: prismis-daemon`,
    );
  }
}

/**
 * Search prismis content via API
 */
export async function searchPrismis(
  query: string,
  options: PrismisSearchOptions = {},
): Promise<PrismisSearchResult[]> {
  // Read config
  const config = readPrismisConfig();
  const apiBase = `http://${config.host}:${DEFAULT_PORT}`;

  // Check daemon is running
  await checkPrismisDaemon(apiBase);

  // Build search URL
  const params = new URLSearchParams({
    q: query,
    limit: String(options.limit ?? 20),
    compact: "true",
  });

  const response = await fetch(`${apiBase}/api/search?${params}`, {
    headers: {
      "X-API-Key": config.apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prismis API error (${response.status}): ${text}`);
  }

  const data: PrismisResponse = await response.json();

  if (!data.success) {
    throw new Error(`Prismis search failed: ${data.message}`);
  }

  // Map prismis items to SearchResult format
  return data.data.items.map((item) => ({
    source: "prismis",
    title: item.title,
    content: item.summary || "",
    metadata: JSON.stringify({
      id: item.id,
      url: item.url,
      priority: item.priority,
      published_at: item.published_at,
      source_name: item.source_name,
    }),
    rank: item.relevance_score,
  }));
}
