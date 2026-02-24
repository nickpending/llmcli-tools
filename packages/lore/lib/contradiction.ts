/**
 * lib/contradiction.ts - Write-time contradiction detection
 *
 * Uses hybrid search + local MLX model to classify new captures against
 * existing entries. Determines whether a new entry should ADD (new info),
 * NOOP (redundant), or DELETE+ADD (supersedes existing).
 *
 * Fail-open design: any error defaults to ADD — never blocks a capture.
 *
 * Usage:
 *   const candidates = await findCandidates(event);
 *   const result = await classifyContradiction(event, candidates);
 *   // result.action: "ADD" | "NOOP" | "DELETE+ADD"
 *   // result.deleteRowid: number (only set for DELETE+ADD)
 */

import { hybridSearch, type HybridResult } from "./semantic.js";
import { PURGEABLE_SOURCES } from "./purge.js";
import type { CaptureEvent } from "./capture.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContradictionAction = "ADD" | "DELETE+ADD" | "NOOP";

export interface ContradictionResult {
  action: ContradictionAction;
  deleteRowid?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MLX_URL = "http://localhost:8080/v1/chat/completions";
const MLX_MODEL = "mlx-community/Qwen2.5-7B-Instruct-4bit";
const MLX_TIMEOUT_MS = 1500;

const CANDIDATE_LIMIT = 5;

// Sources eligible for contradiction checking (same as purgeable)
const CONTRADICTION_SOURCES = new Set<string>(PURGEABLE_SOURCES);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if an event's source is eligible for contradiction detection.
 */
export function isContradictionCheckable(source: string): boolean {
  return CONTRADICTION_SOURCES.has(source);
}

/**
 * Find existing entries that may contradict or duplicate the new event.
 * Uses hybrid search scoped by source + topic for precision.
 *
 * Opens its own read connection (hybridSearch uses openDatabase(true)).
 * Safe in WAL mode — concurrent reads with the write connection in indexAndEmbed.
 *
 * Note: entries inserted in the current indexAndEmbed batch are not visible
 * to this read connection (uncommitted). This is acceptable — same-batch
 * entries are unlikely to contradict each other.
 */
export async function findCandidates(
  event: CaptureEvent,
): Promise<HybridResult[]> {
  const data = event.data as Record<string, unknown>;
  const content = String(data.content || data.text || "");
  const topic = String(data.topic || "");
  const source = getSourceForEvent(event);

  if (!content) return [];

  return hybridSearch(content, {
    source,
    project: topic || undefined,
    limit: CANDIDATE_LIMIT,
  });
}

/**
 * Classify a new event against existing candidates using local MLX model.
 *
 * LLM returns one of:
 *   ADD     — new information not covered by candidates
 *   NOOP    — duplicate/redundant (already captured)
 *   DELETE <rowid> — new info supersedes a specific candidate
 *
 * Fail-open: any error (timeout, parse failure, model down) defaults to ADD.
 */
export async function classifyContradiction(
  event: CaptureEvent,
  candidates: HybridResult[],
): Promise<ContradictionResult> {
  if (candidates.length === 0) {
    return { action: "ADD" };
  }

  const data = event.data as Record<string, unknown>;
  const content = String(data.content || data.text || "");
  const topic = String(data.topic || "");
  const source = getSourceForEvent(event);

  const candidateLines = candidates
    .map((c) => `[rowid: ${c.rowid}] ${c.content}`)
    .join("\n");

  const systemPrompt = `You classify knowledge contradictions. Reply with exactly one word: ADD, NOOP, or DELETE.
  ADD: new information not covered by candidates
  NOOP: duplicate or redundant (already captured)
  DELETE: new information supersedes a candidate (also provide rowid)`;

  const userPrompt = `New entry (source: ${source}, topic: ${topic}):
${content}

Existing entries:
${candidateLines}

If DELETE, reply: DELETE <rowid>
Otherwise reply: ADD or NOOP`;

  try {
    const resp = await fetch(MLX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MLX_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(MLX_TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.error(
        `[contradiction] MLX returned ${resp.status} — defaulting to ADD`,
      );
      return { action: "ADD" };
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = json.choices?.[0]?.message?.content?.trim() || "";
    return parseClassification(raw);
  } catch (err) {
    // Timeout, network error, or model unavailable — fail open
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[contradiction] classification failed (${message}) — defaulting to ADD`,
    );
    return { action: "ADD" };
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Parse LLM response into a ContradictionResult.
 * Accepts: "ADD", "NOOP", "DELETE 123", "DELETE <rowid>"
 * Any parse failure defaults to ADD.
 */
function parseClassification(raw: string): ContradictionResult {
  const normalized = raw.toUpperCase().trim();

  if (normalized === "NOOP") {
    return { action: "NOOP" };
  }

  if (normalized === "ADD") {
    return { action: "ADD" };
  }

  // Match "DELETE <number>" pattern
  const deleteMatch = normalized.match(/^DELETE\s+(\d+)/);
  if (deleteMatch) {
    const rowid = parseInt(deleteMatch[1], 10);
    if (!isNaN(rowid) && rowid > 0) {
      return { action: "DELETE+ADD", deleteRowid: rowid };
    }
  }

  // Unparseable — default to ADD
  console.error(
    `[contradiction] unparseable response "${raw}" — defaulting to ADD`,
  );
  return { action: "ADD" };
}

/**
 * Map event type to source name (mirrors realtime.ts getSourceForEvent).
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
