/**
 * lib/indexers/learnings.ts - Learnings indexer
 *
 * Reads log.jsonl and indexes learning captures.
 * Filters for event=captured AND type=learning.
 *
 * Source: learnings
 * Topic: data.topic
 * Type: (empty)
 * Timestamp: event timestamp
 */

import { readFileSync, existsSync } from "fs";
import type { IndexerContext } from "../indexer";

export async function indexLearnings(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;

  if (!existsSync(logPath)) {
    console.log("No log.jsonl found, skipping learnings");
    return;
  }

  const lines = readFileSync(logPath, "utf-8").split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.event !== "captured" || event.type !== "learning") continue;

      const topic = event.data?.topic || "general";
      const content = event.data?.content || "";
      const persona = event.data?.persona;

      if (!content) continue;

      const metadata: Record<string, unknown> = {};
      if (persona) metadata.persona = persona;

      ctx.insert({
        source: "learnings",
        title: `[learning] ${topic}`,
        content,
        topic,
        timestamp: event.timestamp || "",
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch {
      // Skip malformed JSON
      continue;
    }
  }
}
