/**
 * lib/semantic.ts - Semantic search via local embeddings
 *
 * Query embedding using @huggingface/transformers with nomic-embed-text-v1.5.
 * KNN search against sqlite-vec virtual table.
 * Uses Bun's built-in SQLite with sqlite-vec extension.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { pipeline } from "@huggingface/transformers";
import { getDatabasePath, openDatabase } from "./db.js";

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
  insights: "topic",
  captures: "topic",
  teachings: "topic",
  learnings: "topic",
  observations: "topic",
};

const MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5";
const EMBEDDING_DIM = 768;

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

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Invalid embedding: expected ${EMBEDDING_DIM} dims, got ${embedding.length}`,
    );
  }

  return embedding;
}

/**
 * Embed a document string using local transformers.js model
 * Uses "search_document: " prefix as required by nomic-embed-text
 * @returns 768-dimensional embedding vector
 */
export async function embedDocument(text: string): Promise<number[]> {
  const embedder = await getEmbeddingPipeline();

  const prefixedText = `search_document: ${text}`;
  const output = await embedder(prefixedText, {
    pooling: "mean",
    normalize: true,
  });

  const embedding = Array.from(output.data as Float32Array);

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Invalid embedding: expected ${EMBEDDING_DIM} dims, got ${embedding.length}`,
    );
  }

  return embedding;
}

/**
 * Batch embed multiple documents
 * More efficient than individual calls when embedding several documents
 * @returns array of 768-dimensional embedding vectors
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const embedder = await getEmbeddingPipeline();
  const results: number[][] = [];

  // Process one at a time (transformers.js doesn't batch well)
  // But we benefit from cached pipeline
  for (const text of texts) {
    const prefixedText = `search_document: ${text}`;
    const output = await embedder(prefixedText, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data as Float32Array);

    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Invalid embedding: expected ${EMBEDDING_DIM} dims, got ${embedding.length}`,
      );
    }

    results.push(embedding);
  }

  return results;
}

/**
 * Check if embeddings table has any data
 */
export function hasEmbeddings(): boolean {
  try {
    const db = openDatabase(true);
    try {
      const stmt = db.prepare("SELECT COUNT(*) as count FROM embeddings");
      const result = stmt.get() as { count: number };
      return result.count > 0;
    } finally {
      db.close();
    }
  } catch {
    return false;
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
  // Get query embedding
  const queryEmbedding = await embedQuery(query);
  const queryBlob = serializeEmbedding(queryEmbedding);

  const db = openDatabase(true);

  try {
    const limit = options.limit ?? 20;

    // KNN query - 1:1 mapping between search rows and embeddings
    // Content is pre-chunked at ingest time
    // source/topic partition columns enable filtered KNN (filter BEFORE search)
    let sql: string;
    const params: (Uint8Array | string | number)[] = [queryBlob];

    // Build KNN query with optional partition filters
    const conditions = ["e.embedding MATCH ?", "k = ?"];
    params.push(limit);

    if (options.source) {
      conditions.push("e.source = ?");
      params.push(options.source);
    }

    if (options.project) {
      conditions.push("e.topic = ?");
      params.push(options.project);
    }

    sql = `
      SELECT
        s.source,
        s.title,
        s.content,
        s.metadata,
        e.distance
      FROM embeddings e
      JOIN search s ON e.doc_id = s.rowid
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY e.distance
      LIMIT ?
    `;
    params.push(limit);

    const stmt = db.prepare(sql);
    const results = stmt.all(...params) as SemanticResult[];

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

// Export constants and helpers for realtime.ts
export { MODEL_NAME, EMBEDDING_DIM, serializeEmbedding, getDatabasePath };
