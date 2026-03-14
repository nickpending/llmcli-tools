/**
 * lib/semantic.ts - Semantic search via embeddings
 *
 * Embedding via llm-core's embed() — requires embed server running.
 * No in-process fallback. Start with: llm embed-server start
 * KNN search against sqlite-vec virtual table.
 * Uses Bun's built-in SQLite with sqlite-vec extension.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { embed } from "@voidwire/llm-core";
import { getDatabasePath, openDatabase } from "./db.js";
import { search as keywordSearch, type SearchResult } from "./search.js";
import { getConfig } from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SemanticResult {
  rowid: number;
  source: string;
  title: string;
  content: string;
  metadata: string;
  topic: string;
  type: string;
  distance: number;
}

export interface SemanticSearchOptions {
  source?: string | string[];
  limit?: number;
  project?: string;
  type?: string | string[];
  since?: string;
}

const { model: MODEL_NAME, dimensions: EMBEDDING_DIM } = getConfig().embedding;

/**
 * Embed a query string via the embed server
 * Uses "search_query" prefix as required by nomic-embed-text
 * @returns 768-dimensional embedding vector
 */
export async function embedQuery(query: string): Promise<number[]> {
  const result = await embed({ text: query, prefix: "search_query" });
  return result.embedding;
}

/**
 * Embed a document string via the embed server
 * Uses "search_document" prefix as required by nomic-embed-text
 * @returns 768-dimensional embedding vector
 */
export async function embedDocument(text: string): Promise<number[]> {
  const result = await embed({ text, prefix: "search_document" });
  return result.embedding;
}

/**
 * Batch embed multiple documents via the embed server
 * @returns array of 768-dimensional embedding vectors
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return Promise.all(
    texts.map((t) =>
      embed({ text: t, prefix: "search_document" }).then((r) => r.embedding),
    ),
  );
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
      const sources = Array.isArray(options.source)
        ? options.source
        : [options.source];
      if (sources.length === 1) {
        conditions.push("e.source = ?");
        params.push(sources[0]);
      } else {
        const placeholders = sources.map(() => "?").join(", ");
        conditions.push(`e.source IN (${placeholders})`);
        params.push(...sources);
      }
    }

    if (options.project) {
      conditions.push("e.topic = ?");
      params.push(options.project);
    }

    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      const placeholders = types.map(() => "?").join(", ");
      conditions.push(`e.type IN (${placeholders})`);
      params.push(...types);
    }

    if (options.since) {
      conditions.push("e.timestamp != ''");
      conditions.push("e.timestamp >= ?");
      params.push(options.since);
    }

    sql = `
      SELECT
        s.rowid,
        s.source,
        s.title,
        s.content,
        s.metadata,
        s.topic,
        s.type,
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
 * Result from hybrid search with fused score
 */
export interface HybridResult {
  rowid: number;
  source: string;
  title: string;
  content: string;
  metadata: string;
  topic: string;
  type: string;
  score: number;
  vectorScore: number;
  textScore: number;
}

export interface HybridSearchOptions {
  source?: string | string[];
  limit?: number;
  project?: string;
  since?: string;
  type?: string | string[];
  vectorWeight?: number;
  textWeight?: number;
}

/**
 * Normalize BM25 rank to 0-1 score (higher = better match)
 * FTS5 rank is negative (more negative = better match)
 */
function bm25RankToScore(rank: number): number {
  // rank is negative, more negative = better
  // Convert to positive score: 1 - (1 / (1 + |rank|))
  // rank = -15 → score = 0.94
  // rank = -1 → score = 0.50
  // rank = -0.1 → score = 0.09
  return 1 - 1 / (1 + Math.abs(rank));
}

/**
 * Normalize vector distance to 0-1 score (higher = better match)
 * Cosine distance is 0-2 (0 = identical, 2 = opposite)
 */
function distanceToScore(distance: number): number {
  // distance 0 = score 1, distance 2 = score 0
  return Math.max(0, 1 - distance / 2);
}

/**
 * Perform hybrid search combining vector and keyword results
 * Runs both searches in parallel, merges by rowid, fuses scores
 *
 * @param query - Search query
 * @param options - Search options including optional weight tuning
 * @returns Results sorted by fused score (0.7 vector + 0.3 keyword by default)
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridResult[]> {
  const vectorWeight = options.vectorWeight ?? 0.7;
  const textWeight = options.textWeight ?? 0.3;
  const limit = options.limit ?? 20;

  // Fetch more results from each search to ensure good merge coverage
  const fetchLimit = Math.max(limit * 2, 50);

  // Run both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    semanticSearch(query, {
      source: options.source,
      limit: fetchLimit,
      project: options.project,
      type: options.type,
      since: options.since,
    }),
    Promise.resolve(
      keywordSearch(query, {
        source: options.source,
        limit: fetchLimit,
        since: options.since,
        type: options.type,
      }),
    ),
  ]);

  // Merge by rowid
  const merged = new Map<number, HybridResult>();

  // Add vector results
  for (const r of vectorResults) {
    const vectorScore = distanceToScore(r.distance);
    merged.set(r.rowid, {
      rowid: r.rowid,
      source: r.source,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      topic: r.topic,
      type: r.type,
      vectorScore,
      textScore: 0,
      score: vectorWeight * vectorScore,
    });
  }

  // Merge keyword results
  for (const r of keywordResults) {
    const textScore = bm25RankToScore(r.rank);
    const existing = merged.get(r.rowid);

    if (existing) {
      // Update with keyword score
      existing.textScore = textScore;
      existing.score =
        vectorWeight * existing.vectorScore + textWeight * textScore;
      // Use keyword content (has snippets with highlights)
      existing.content = r.content;
    } else {
      // New entry from keyword only
      merged.set(r.rowid, {
        rowid: r.rowid,
        source: r.source,
        title: r.title,
        content: r.content,
        metadata: r.metadata,
        topic: r.topic,
        type: r.type,
        vectorScore: 0,
        textScore,
        score: textWeight * textScore,
      });
    }
  }

  // Sort by fused score (descending) and limit
  const results = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
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
      const project = r.topic || "unknown";
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
