/**
 * lib/cache.ts - Embedding cache utilities
 *
 * Hash-based caching to avoid re-embedding unchanged content.
 * Used by real-time indexing and batch lore-embed-all.
 */

import { createHash } from "crypto";
import type { Database } from "bun:sqlite";

/**
 * Generate SHA256 hash of content for cache lookup
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Get cached embedding by content hash
 * @returns embedding array or null if not cached
 */
export function getCachedEmbedding(
  db: Database,
  hash: string,
): number[] | null {
  const stmt = db.prepare(
    "SELECT embedding FROM embedding_cache WHERE hash = ?",
  );
  const row = stmt.get(hash) as { embedding: Uint8Array } | null;

  if (!row) {
    return null;
  }

  // Convert blob back to number array
  const float32 = new Float32Array(row.embedding.buffer);
  return Array.from(float32);
}

/**
 * Store embedding in cache
 */
export function cacheEmbedding(
  db: Database,
  hash: string,
  embedding: number[],
  model: string,
): void {
  // Serialize embedding to blob
  const buffer = new Float32Array(embedding);
  const blob = new Uint8Array(buffer.buffer);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO embedding_cache (hash, embedding, model, dims, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(hash, blob, model, embedding.length, Date.now());
}

/**
 * Check if embedding exists in cache (without retrieving it)
 */
export function hasEmbeddingCached(db: Database, hash: string): boolean {
  const stmt = db.prepare(
    "SELECT 1 FROM embedding_cache WHERE hash = ? LIMIT 1",
  );
  return stmt.get(hash) !== null;
}

/**
 * Batch check which hashes are missing from cache
 * @returns array of hashes that need embedding
 */
export function getMissingHashes(db: Database, hashes: string[]): string[] {
  if (hashes.length === 0) return [];

  const placeholders = hashes.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT hash FROM embedding_cache WHERE hash IN (${placeholders})`,
  );
  const rows = stmt.all(...hashes) as { hash: string }[];

  const cachedSet = new Set(rows.map((r) => r.hash));
  return hashes.filter((h) => !cachedSet.has(h));
}
