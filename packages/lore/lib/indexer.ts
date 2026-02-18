/**
 * lib/indexer.ts - Indexer framework core
 *
 * Shared framework for all indexers. Handles:
 * - IndexEntry/IndexerContext interfaces
 * - Content chunking (2500 chars, 200 overlap, sentence boundaries)
 * - Content hash dedup (SHA-256)
 * - Entry validation (no topic/content in metadata, no internals)
 * - FTS5 parameterized INSERT
 * - Orchestration (runIndexer)
 *
 * Usage:
 *   import { runIndexer, type IndexerFunction } from "./indexer";
 *   const myIndexer: IndexerFunction = async (ctx) => {
 *     ctx.insert({ source: "mySource", title: "...", content: "...", topic: "..." });
 *   };
 */

import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { getConfig, type LoreConfig } from "./config";

export interface IndexEntry {
  source: string;
  title: string;
  content: string;
  topic: string;
  type?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface IndexerContext {
  db: Database;
  config: LoreConfig;
  insert: (entry: IndexEntry) => void;
  rebuild: boolean;
}

export type IndexerFunction = (ctx: IndexerContext) => Promise<void>;

/**
 * Content chunking with overlap.
 * Splits content at sentence boundaries when possible.
 * Chunk size: 2500 chars, overlap: 200 chars.
 */
function chunkContent(content: string): string[] {
  const CHUNK_SIZE = 2500;
  const OVERLAP = 200;

  if (content.length <= CHUNK_SIZE) return [content];

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    let end = start + CHUNK_SIZE;

    // Break at sentence boundary if possible
    if (end < content.length) {
      const slice = content.slice(start, end);
      // Try paragraph break first, then sentence break
      const paragraphBreak = slice.lastIndexOf("\n\n");
      if (paragraphBreak > CHUNK_SIZE - 500) {
        end = start + paragraphBreak + 2;
      } else {
        const sentenceBreak = slice.search(/[.!?]\s+(?=[A-Z])/);
        if (sentenceBreak > -1) {
          // Find the last sentence break, not the first
          const lastSentenceBreak = slice
            .slice(0, end - start)
            .lastIndexOf(". ");
          if (lastSentenceBreak > CHUNK_SIZE - 500) {
            end = start + lastSentenceBreak + 2;
          }
        }
      }
    } else {
      end = content.length;
    }

    chunks.push(content.slice(start, end));

    if (end >= content.length) break;
    start = end - OVERLAP;
  }

  return chunks;
}

/**
 * Validate entry before insert.
 * Ensures metadata does not contain promoted columns or framework internals.
 */
function validateEntry(entry: IndexEntry): void {
  const meta = entry.metadata || {};

  if ("topic" in meta) {
    console.warn(
      `WARNING: topic should not be in metadata for ${entry.source}:${entry.title}`,
    );
  }
  if ("content" in meta) {
    console.warn(
      `WARNING: content should not be in metadata for ${entry.source}:${entry.title}`,
    );
  }
  const forbidden = ["content_hash", "chunk_idx", "total_chunks"];
  for (const key of forbidden) {
    if (key in meta) {
      throw new Error(
        `Framework internal '${key}' found in metadata for ${entry.source}:${entry.title}`,
      );
    }
  }
}

/**
 * Create an IndexerContext with insert helper that handles
 * validation, dedup, chunking, and FTS5 insert.
 */
export function createIndexerContext(
  db: Database,
  config: LoreConfig,
  rebuild: boolean,
  seenHashes: Set<string>,
): IndexerContext {
  const insertStmt = db.prepare(
    "INSERT INTO search (source, title, content, metadata, topic, type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  return {
    db,
    config,
    rebuild,
    insert: (entry: IndexEntry) => {
      validateEntry(entry);

      // Generate content hash for dedup
      const contentHash = createHash("sha256")
        .update(entry.content)
        .digest("hex");

      // Skip if already indexed
      if (seenHashes.has(contentHash)) {
        return;
      }
      seenHashes.add(contentHash);

      // Chunk content if needed
      const chunks = chunkContent(entry.content);

      // Insert each chunk (dedup at chunk level)
      for (const chunk of chunks) {
        const chunkHash = createHash("sha256").update(chunk).digest("hex");
        if (seenHashes.has(chunkHash)) continue;
        seenHashes.add(chunkHash);
        insertStmt.run(
          entry.source,
          entry.title,
          chunk,
          JSON.stringify(entry.metadata || {}),
          entry.topic,
          entry.type || "",
          entry.timestamp || "",
        );
      }
    },
  };
}

/**
 * Main indexing orchestrator.
 * Runs registered indexers for the given source (or all).
 */
export async function runIndexer(
  source: string | "all",
  rebuild: boolean,
  registry: Record<string, IndexerFunction>,
): Promise<void> {
  const config = getConfig();
  const db = new Database(config.database.sqlite);

  try {
    db.run("PRAGMA busy_timeout = 5000");

    // Initialize seen hashes set
    const seenHashes = new Set<string>();

    const ctx = createIndexerContext(db, config, rebuild, seenHashes);

    // Determine which indexers to run
    const toRun = source === "all" ? Object.keys(registry) : [source];

    for (const src of toRun) {
      const indexer = registry[src];
      if (!indexer) {
        console.error(`Unknown source: ${src}`);
        continue;
      }

      console.log(`Indexing ${src}...`);

      // Clear source if rebuilding
      if (rebuild) {
        db.run("DELETE FROM search WHERE source = ?", [src]);
      }

      await indexer(ctx);
    }

    console.log("Indexing complete");
  } finally {
    db.close();
  }
}
