/**
 * lib/semantic.ts - Semantic search via local embeddings
 *
 * Query embedding using @huggingface/transformers with nomic-embed-text-v1.5.
 * KNN search against sqlite-vec virtual table.
 * Uses Bun's built-in SQLite with sqlite-vec extension.
 *
 * Note: macOS ships Apple's SQLite which disables extension loading.
 * We use Homebrew's SQLite via setCustomSQLite() to enable sqlite-vec.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { existsSync } from "fs";
import { pipeline } from "@huggingface/transformers";

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
  project?: string;
}

/**
 * Maps source types to their project/topic field name in metadata JSON.
 * Project-based domains use "project", topic-based domains use "topic".
 */
const PROJECT_FIELD: Record<string, string> = {
  commits: "project",
  sessions: "project",
  tasks: "project",
  insights: "project",
  captures: "topic",
  teachings: "topic",
  learnings: "topic",
  observations: "topic",
};

const MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5";

interface EmbeddingPipeline {
  (
    text: string,
    options?: { pooling?: string; normalize?: boolean },
  ): Promise<{
    data: Float32Array;
  }>;
}

// Cache the pipeline to avoid reloading on every query
let cachedPipeline: EmbeddingPipeline | null = null;

function getDatabasePath(): string {
  return `${homedir()}/.local/share/lore/lore.db`;
}

/**
 * Get or create the embedding pipeline
 * Pipeline is cached after first load for performance
 */
async function getEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  if (cachedPipeline) {
    return cachedPipeline;
  }

  try {
    const p = await pipeline("feature-extraction", MODEL_NAME, {
      dtype: "fp32",
    });
    cachedPipeline = p as unknown as EmbeddingPipeline;
    return cachedPipeline;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load embedding model: ${message}\n` +
        `Note: First run downloads ~500MB model to ~/.cache/huggingface/hub`,
    );
  }
}

/**
 * Embed a query string using local transformers.js model
 * Uses "search_query: " prefix as required by nomic-embed-text
 * @returns 768-dimensional embedding vector
 */
export async function embedQuery(query: string): Promise<number[]> {
  const embedder = await getEmbeddingPipeline();

  // nomic model requires "search_query: " prefix for queries
  // (FastEmbed uses "search_document: " prefix during indexing)
  const prefixedQuery = `search_query: ${query}`;
  const output = await embedder(prefixedQuery, {
    pooling: "mean",
    normalize: true,
  });

  // Output is a Tensor, convert to array
  const embedding = Array.from(output.data as Float32Array);

  if (embedding.length !== 768) {
    throw new Error(
      `Invalid embedding: expected 768 dims, got ${embedding.length}`,
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
      // Filter by e.source (partition column) for KNN pre-filtering
      // This filters BEFORE KNN, not after — critical for domain-specific search
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
          AND e.source = ?
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

    // Post-filter by project if specified
    // KNN WHERE clause doesn't support json_extract on joined metadata,
    // so we filter after the query returns
    if (options.project) {
      return results.filter((result) => {
        const field = PROJECT_FIELD[result.source];
        if (!field) return false;

        try {
          const metadata = JSON.parse(result.metadata);
          return metadata[field] === options.project;
        } catch {
          // Skip results with malformed metadata
          return false;
        }
      });
    }

    return results;
  } finally {
    db.close();
  }
}

/**
 * Extract project from result metadata
 */
function extractProjectFromMetadata(metadata: string, source: string): string {
  const field = PROJECT_FIELD[source];
  if (!field) return "unknown";

  try {
    const parsed = JSON.parse(metadata);
    return parsed[field] || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Extract identifier from semantic result
 */
function extractIdentifierFromResult(result: SemanticResult): string {
  try {
    const metadata = JSON.parse(result.metadata);

    switch (result.source) {
      case "commits":
        return metadata.sha?.substring(0, 7) || "";
      case "sessions":
        return metadata.session_id?.substring(0, 8) || "";
      default:
        return metadata.id || "";
    }
  } catch {
    return "";
  }
}

/**
 * Get the best display text for a result
 * Commits use content (commit message), others use title
 */
function getDisplayText(result: SemanticResult): string {
  if (result.source === "commits") {
    return result.content || result.title;
  }
  return result.title;
}

/**
 * Format semantic search results as brief, compact output
 * Groups by source type, one line per result
 */
export function formatBriefSearch(results: SemanticResult[]): string {
  if (results.length === 0) {
    return "(no results)";
  }

  // Group results by source
  const grouped = new Map<string, SemanticResult[]>();
  results.forEach((result) => {
    const existing = grouped.get(result.source) || [];
    existing.push(result);
    grouped.set(result.source, existing);
  });

  const sections: string[] = [];

  // Format each source group
  grouped.forEach((sourceResults, source) => {
    const lines = [`${source} (${sourceResults.length}):`];

    sourceResults.forEach((r) => {
      const project = extractProjectFromMetadata(r.metadata, r.source);
      const identifier = extractIdentifierFromResult(r);
      const displayText = getDisplayText(r);

      const line = identifier
        ? `  ${project}: ${identifier} - ${displayText}`
        : `  ${project}: ${displayText}`;

      lines.push(line);
    });

    sections.push(lines.join("\n"));
  });

  return sections.join("\n\n");
}
