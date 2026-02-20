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

import { readFileSync } from "fs";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexLearnings(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;
  if (
    !checkPath(
      "learnings",
      "log.jsonl",
      logPath,
      "populated by Sable session hooks",
    )
  )
    return;

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
        title: topic,
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
