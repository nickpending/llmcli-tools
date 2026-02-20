/**
 * lib/indexers/teachings.ts - Teachings indexer
 *
 * Reads log.jsonl and indexes teaching captures.
 * Filters for event=captured AND type=teaching.
 *
 * Source: teachings
 * Topic: data.topic (AI-written)
 * Type: teaching (fixed)
 * Timestamp: event timestamp
 */

import { readFileSync } from "fs";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexTeachings(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;
  if (
    !checkPath(
      "teachings",
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
      if (event.event !== "captured" || event.type !== "teaching") continue;

      const topic = event.data?.topic || "general";
      const content = event.data?.content || "";
      const confidence = event.data?.confidence;

      if (!content) continue;

      const metadata: Record<string, unknown> = {};
      if (confidence) metadata.confidence = confidence;

      ctx.insert({
        source: "teachings",
        title: topic,
        content,
        topic,
        type: "teaching",
        timestamp: event.timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      continue;
    }
  }
}
