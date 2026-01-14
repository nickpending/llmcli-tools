/**
 * lib/semantic.ts - Semantic search via Ollama embeddings
 *
 * Query embedding and KNN search against sqlite-vec virtual table.
 * Uses Bun's built-in SQLite with sqlite-vec extension.
 *
 * Note: macOS ships Apple's SQLite which disables extension loading.
 * We use Homebrew's SQLite via setCustomSQLite() to enable sqlite-vec.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";

// Use Homebrew SQLite on macOS to enable extension loading
// Must be called before any Database instances are created
const HOMEBREW_SQLITE = "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";
if (existsSync(HOMEBREW_SQLITE)) {
  Database.setCustomSQLite(HOMEBREW_SQLITE);
}

export interface SemanticResult {
  source: string;
  title: string;
  content: string;
  metadata: string;
  distance: number;
}

export interface SemanticSearchOptions {
  source?: string;
  limit?: number;
}

interface EmbeddingConfig {
  endpoint: string;
  model: string;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  endpoint: "http://localhost:11434",
  model: "nomic-embed-text",
};

function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
}

function getConfigPath(): string {
  return `${homedir()}/.config/lore/config.toml`;
}

/**
 * Load embedding config from config.toml
 * Falls back to [llm].api_base if [embedding].endpoint not set
 */
function loadEmbeddingConfig(): EmbeddingConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, "utf-8");

    // Extract [embedding].endpoint first
    const endpointMatch = content.match(
      /\[embedding\][^[]*endpoint\s*=\s*"([^"]+)"/s,
    );
    if (endpointMatch) {
      const modelMatch = content.match(
        /\[embedding\][^[]*model\s*=\s*"([^"]+)"/s,
      );
      return {
        endpoint: endpointMatch[1],
        model: modelMatch?.[1] ?? DEFAULT_CONFIG.model,
      };
    }

    // Fall back to [llm].api_base
    const apiBaseMatch = content.match(/\[llm\][^[]*api_base\s*=\s*"([^"]+)"/s);
    if (apiBaseMatch) {
      const modelMatch = content.match(
        /\[embedding\][^[]*model\s*=\s*"([^"]+)"/s,
      );
      return {
        endpoint: apiBaseMatch[1],
        model: modelMatch?.[1] ?? DEFAULT_CONFIG.model,
      };
    }

    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Check if Ollama is available at configured endpoint
 */
export async function isOllamaAvailable(): Promise<boolean> {
  const config = loadEmbeddingConfig();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${config.endpoint}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Embed a query string using Ollama
 * @returns 768-dimensional embedding vector
 */
export async function embedQuery(query: string): Promise<number[]> {
  const config = loadEmbeddingConfig();
  const url = `${config.endpoint}/api/embeddings`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt: query,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API error: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as { embedding?: number[] };
  const embedding = result.embedding;

  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(
      `Invalid embedding: expected 768 dims, got ${embedding?.length ?? 0}`,
    );
  }

  return embedding;
}

/**
 * Check if embeddings table has any data
 */
export function hasEmbeddings(): boolean {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    return false;
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    // Load sqlite-vec extension
    const vecPath = process.env.SQLITE_VEC_PATH;
    if (!vecPath) {
      return false;
    }

    db.loadExtension(vecPath);

    const stmt = db.prepare("SELECT COUNT(*) as count FROM embeddings");
    const result = stmt.get() as { count: number };
    return result.count > 0;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/**
 * Serialize embedding to blob format for sqlite-vec
 */
function serializeEmbedding(embedding: number[]): Uint8Array {
  const buffer = new Float32Array(embedding);
  return new Uint8Array(buffer.buffer);
}

/**
 * Perform semantic search using KNN against embeddings table
 */
export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions = {},
): Promise<SemanticResult[]> {
  const dbPath = getDatabasePath();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  // Get query embedding
  const queryEmbedding = await embedQuery(query);
  const queryBlob = serializeEmbedding(queryEmbedding);

  const db = new Database(dbPath, { readonly: true });

  try {
    // Load sqlite-vec extension
    const vecPath = process.env.SQLITE_VEC_PATH;
    if (!vecPath) {
      throw new Error(
        'SQLITE_VEC_PATH not set. Get path with: python3 -c "import sqlite_vec; print(sqlite_vec.loadable_path())"',
      );
    }

    db.loadExtension(vecPath);

    const limit = options.limit ?? 20;

    // KNN query - 1:1 mapping between search rows and embeddings
    // Content is pre-chunked at ingest time
    let sql: string;
    const params: (Uint8Array | string | number)[] = [queryBlob];

    if (options.source) {
      sql = `
        SELECT
          s.source,
          s.title,
          s.content,
          s.metadata,
          e.distance
        FROM embeddings e
        JOIN search s ON e.doc_id = s.rowid
        WHERE e.embedding MATCH ?
          AND k = ?
          AND s.source = ?
        ORDER BY e.distance
        LIMIT ?
      `;
      params.push(limit);
      params.push(options.source);
      params.push(limit);
    } else {
      sql = `
        SELECT
          s.source,
          s.title,
          s.content,
          s.metadata,
          e.distance
        FROM embeddings e
        JOIN search s ON e.doc_id = s.rowid
        WHERE e.embedding MATCH ?
          AND k = ?
        ORDER BY e.distance
        LIMIT ?
      `;
      params.push(limit);
      params.push(limit);
    }

    const stmt = db.prepare(sql);
    const results = stmt.all(...params) as SemanticResult[];

    return results;
  } finally {
    db.close();
  }
}
