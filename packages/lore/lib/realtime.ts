/**
 * lib/realtime.ts - Real-time indexing for captures
 *
 * Makes captures immediately searchable (keyword + semantic) without
 * waiting for batch indexers.
 *
 * Usage:
 *   // CLI - single capture
 *   const event = captureKnowledge(input);
 *   await indexAndEmbed([event]);
 *
 *   // Hook - batch captures
 *   const events = captures.map(cap => captureKnowledge(cap));
 *   await indexAndEmbed(events);
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import {
  embedDocuments,
  getDatabasePath,
  MODEL_NAME,
  EMBEDDING_DIM,
  serializeEmbedding,
} from "./semantic.js";
import { hashContent, getCachedEmbedding, cacheEmbedding } from "./cache.js";
import type { CaptureEvent } from "./capture.js";

/**
 * Index and embed capture events for immediate searchability
 *
 * 1. Insert into FTS5 search table (instant keyword search)
 * 2. Generate embeddings with cache (instant semantic search)
 * 3. Insert into embeddings table
 */
export async function indexAndEmbed(events: CaptureEvent[]): Promise<void> {
  if (events.length === 0) return;

  const dbPath = getDatabasePath();
  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run lore-db-init first.`);
  }

  const db = new Database(dbPath);

  try {
    // Load sqlite-vec extension for embeddings table
    const vecPath = process.env.SQLITE_VEC_PATH;
    if (!vecPath) {
      throw new Error(
        'SQLITE_VEC_PATH not set. Get path with: python3 -c "import sqlite_vec; print(sqlite_vec.loadable_path())"',
      );
    }
    db.loadExtension(vecPath);

    // 1. Insert into FTS5 and collect doc IDs
    const docIds: number[] = [];
    for (const event of events) {
      const docId = insertSearchEntry(db, event);
      docIds.push(docId);
    }

    // 2. Generate embeddings with cache
    const contents = events.map((e) => getContentForEmbedding(e));
    const embeddings = await embedWithCache(db, contents);

    // 3. Insert embeddings
    for (let i = 0; i < events.length; i++) {
      insertEmbedding(db, docIds[i], embeddings[i], events[i]);
    }
  } finally {
    db.close();
  }
}

/**
 * Insert event into FTS5 search table
 * @returns rowid of inserted entry (used as doc_id for embeddings)
 */
function insertSearchEntry(db: Database, event: CaptureEvent): number {
  const source = getSourceForEvent(event);
  const title = buildTitle(event);
  const content = getContentForEmbedding(event);
  const metadata = buildMetadata(event);
  const data = event.data as Record<string, unknown>;
  const topic = String(data.topic || "");
  const type = extractType(event);
  const timestamp = event.timestamp || new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO search (source, title, content, metadata, topic, type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    source,
    title,
    content,
    metadata,
    topic,
    type,
    timestamp,
  );
  return Number(result.lastInsertRowid);
}

/**
 * Map event type to source name used in search table
 */
function getSourceForEvent(event: CaptureEvent): string {
  switch (event.type) {
    case "knowledge":
      return "captures";
    case "teaching":
      return "teachings";
    case "observation":
      return "observations";
    case "insight":
      return "insights";
    case "learning":
      return "learnings";
    case "task":
      return "flux";
    case "note":
      return "captures";
    default:
      return "captures";
  }
}

/**
 * Build title for FTS5 entry, matching existing indexer format
 */
function buildTitle(event: CaptureEvent): string {
  const data = event.data as Record<string, unknown>;

  switch (event.type) {
    case "knowledge":
      return `[${data.subtype || "knowledge"}] ${data.topic || "general"}`;
    case "teaching":
      return `[${data.topic || "general"}] (${data.confidence || "medium"})`;
    case "observation":
      return `[${data.subtype || "pattern"}] ${data.topic || "general"}`;
    case "insight":
      return `[${data.subtype || "insight"}] ${data.topic || "general"}`;
    case "learning":
      return `[learning] ${data.topic || "general"}`;
    case "task":
      return `[task] ${data.topic || "general"}: ${data.name || "untitled"}`;
    case "note":
      return `[note] ${data.topic || "general"}`;
  }
}

/**
 * Extract content for embedding from event
 * Concatenates topic+content for richer embeddings (matches lore-embed-all)
 */
function getContentForEmbedding(event: CaptureEvent): string {
  const data = event.data as Record<string, unknown>;
  const content = String(data.content || data.text || "");
  const topic = String(data.topic || "").trim();
  return topic ? `${topic} ${content}`.trim() : content;
}

/**
 * Build metadata JSON matching existing indexer format
 */
function buildMetadata(event: CaptureEvent): string {
  const data = event.data as Record<string, unknown>;
  const metadata: Record<string, unknown> = {};

  // Add type-specific fields only (no topic, content, content_hash, date, timestamp)
  switch (event.type) {
    case "knowledge":
      metadata.subtype = data.subtype;
      break;
    case "teaching":
      metadata.confidence = data.confidence;
      break;
    case "observation":
      metadata.subtype = data.subtype;
      metadata.confidence = data.confidence;
      break;
    case "insight":
      metadata.subtype = data.subtype;
      metadata.session_id = data.session_id;
      break;
    case "learning":
      metadata.persona = data.persona;
      break;
    case "task":
      metadata.name = data.name;
      metadata.problem = data.problem;
      metadata.solution = data.solution;
      break;
    case "note":
      metadata.tags = data.tags;
      break;
  }

  return JSON.stringify(metadata);
}

/**
 * Embed contents with cache lookup
 * Only generates embeddings for cache misses
 */
async function embedWithCache(
  db: Database,
  contents: string[],
): Promise<number[][]> {
  const results: (number[] | null)[] = new Array(contents.length).fill(null);
  const toEmbed: { idx: number; content: string }[] = [];

  // Check cache for each content
  const hashes = contents.map((c) => hashContent(c));

  for (let i = 0; i < contents.length; i++) {
    const cached = getCachedEmbedding(db, hashes[i]);
    if (cached) {
      results[i] = cached;
    } else {
      toEmbed.push({ idx: i, content: contents[i] });
    }
  }

  // Embed cache misses
  if (toEmbed.length > 0) {
    const embeddings = await embedDocuments(toEmbed.map((t) => t.content));

    for (let i = 0; i < toEmbed.length; i++) {
      const { idx, content } = toEmbed[i];
      const embedding = embeddings[i];

      results[idx] = embedding;
      cacheEmbedding(db, hashContent(content), embedding, MODEL_NAME);
    }
  }

  return results as number[][];
}

/**
 * Insert embedding into vec0 table
 */
function insertEmbedding(
  db: Database,
  docId: number,
  embedding: number[],
  event: CaptureEvent,
): void {
  const source = getSourceForEvent(event);
  const data = event.data as Record<string, unknown>;
  const topic = String(data.topic || "");
  const type = extractType(event);

  const embeddingBlob = serializeEmbedding(embedding);

  const stmt = db.prepare(`
    INSERT INTO embeddings (doc_id, chunk_idx, source, topic, type, embedding)
    VALUES (?, 0, ?, ?, ?, ?)
  `);

  stmt.run(docId, source, topic, type, embeddingBlob);
}

/**
 * Extract type value for embeddings partition column
 */
function extractType(event: CaptureEvent): string {
  const data = event.data as Record<string, unknown>;

  switch (event.type) {
    case "knowledge":
      return String(data.subtype || "general");
    case "teaching":
      return "teaching";
    case "observation":
      return String(data.subtype || "pattern");
    case "insight":
      return String(data.subtype || "insight");
    case "learning":
      return "learning";
    case "task":
      return "task";
    case "note":
      return "note";
    default:
      return "general";
  }
}
