#!/usr/bin/env bun
/**
 * embed-server.ts - Persistent embedding server
 *
 * Loads nomic-embed-text-v1.5 once on startup and serves embedding requests
 * via HTTP. Eliminates the 689ms cold start on every bun process invocation.
 *
 * Endpoints:
 *   GET  /health → { status, model, dims }
 *   POST /embed  → { text, prefix } → { embedding, dims, durationMs }
 *
 * Usage:
 *   EMBED_PORT=8090 bun run embed-server.ts
 */

import { pipeline } from "@huggingface/transformers";

const PORT = parseInt(process.env.EMBED_PORT || "8090", 10);
const MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5";
const EMBEDDING_DIM = 768;

interface EmbedRequest {
  text: string;
  prefix?: string;
}

interface EmbeddingPipeline {
  (
    text: string,
    options?: { pooling?: string; normalize?: boolean },
  ): Promise<{
    data: Float32Array;
  }>;
}

// Module-scoped pipeline — loaded once on startup
let embedder: EmbeddingPipeline | null = null;

/**
 * Load the embedding model pipeline
 */
async function loadModel(): Promise<void> {
  const start = performance.now();
  console.error(`[embed-server] Loading model ${MODEL_NAME}...`);

  const p = await pipeline("feature-extraction", MODEL_NAME, {
    dtype: "fp32",
  });
  embedder = p as unknown as EmbeddingPipeline;

  const elapsed = (performance.now() - start).toFixed(0);
  console.error(`[embed-server] Model loaded in ${elapsed}ms`);
}

/**
 * Handle /health GET requests
 */
function handleHealth(): Response {
  return Response.json({
    status: "ok",
    model: MODEL_NAME,
    dims: EMBEDDING_DIM,
  });
}

/**
 * Handle /embed POST requests
 */
async function handleEmbed(req: Request): Promise<Response> {
  if (!embedder) {
    return Response.json({ error: "Model not loaded" }, { status: 503 });
  }

  let body: EmbedRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.text || typeof body.text !== "string") {
    return Response.json(
      { error: "Missing or invalid 'text' field" },
      { status: 400 },
    );
  }

  // Prepend nomic prefix (default to search_query)
  const prefix = body.prefix || "search_query";
  const prefixedText = `${prefix}: ${body.text}`;

  const start = performance.now();
  const output = await embedder(prefixedText, {
    pooling: "mean",
    normalize: true,
  });
  const durationMs = Math.round(performance.now() - start);

  const embedding = Array.from(output.data as Float32Array);

  if (embedding.length !== EMBEDDING_DIM) {
    return Response.json(
      {
        error: `Unexpected dimensions: got ${embedding.length}, expected ${EMBEDDING_DIM}`,
      },
      { status: 500 },
    );
  }

  return Response.json({
    embedding,
    dims: EMBEDDING_DIM,
    durationMs,
  });
}

/**
 * Request router
 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/health" && req.method === "GET") {
    return handleHealth();
  }

  if (url.pathname === "/embed" && req.method === "POST") {
    return handleEmbed(req);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.error("[embed-server] SIGTERM received, shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.error("[embed-server] SIGINT received, shutting down");
  process.exit(0);
});

// Startup
await loadModel();

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.error(
  `[embed-server] Ready on http://localhost:${server.port} (${MODEL_NAME}, ${EMBEDDING_DIM}d)`,
);
