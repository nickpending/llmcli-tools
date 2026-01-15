/**
 * Prismis API integration
 *
 * Queries prismis daemon REST API for semantic search across content.
 * Config priority:
 *   1. ~/.config/lore/config.toml [remote] section
 *   2. ~/.config/prismis/config.toml [api] section (local daemon fallback)
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
const LORE_CONFIG_PATH = join(
  process.env.HOME ?? "",
  ".config",
  "lore",
  "config.toml",
);
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
  url: string;
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
 * Try to read [remote] section from lore config
 */
function readLoreRemoteConfig(): PrismisConfig | null {
  if (!existsSync(LORE_CONFIG_PATH)) {
    return null;
  }

  const content = readFileSync(LORE_CONFIG_PATH, "utf-8");

  const urlMatch = content.match(/\[remote\][^[]*url\s*=\s*"([^"]+)"/s);
  const keyMatch = content.match(/\[remote\][^[]*key\s*=\s*"([^"]+)"/s);

  if (urlMatch && keyMatch) {
    return {
      url: urlMatch[1],
      apiKey: keyMatch[1],
    };
  }

  return null;
}

/**
 * Read prismis config from local prismis config.toml
 */
function readLocalPrismisConfig(): PrismisConfig {
  if (!existsSync(PRISMIS_CONFIG_PATH)) {
    throw new Error(
      `Prismis config not found. Add [remote] to ~/.config/lore/config.toml ` +
        `or install prismis locally.`,
    );
  }

  const content = readFileSync(PRISMIS_CONFIG_PATH, "utf-8");

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
    url: `http://${host}:${DEFAULT_PORT}`,
    apiKey: keyMatch[1],
  };
}

/**
 * Read prismis config - tries lore [remote] first, falls back to local prismis
 */
function readPrismisConfig(): PrismisConfig {
  const remoteConfig = readLoreRemoteConfig();
  if (remoteConfig) {
    return remoteConfig;
  }
  return readLocalPrismisConfig();
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
  const apiBase = config.url;

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
