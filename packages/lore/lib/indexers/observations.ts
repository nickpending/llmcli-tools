/**
 * lib/indexers/observations.ts - Observations indexer
 *
 * Reads log.jsonl and indexes observation captures.
 * Filters for event=captured AND type=observation.
 *
 * Source: observations
 * Topic: data.topic (AI-written)
 * Type: data.subtype or "pattern" (default)
 * Timestamp: event timestamp
 */

import { readFileSync } from "fs";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexObservations(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;
  if (
    !checkPath(
      "observations",
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
      if (event.event !== "captured" || event.type !== "observation") continue;

      const topic = event.data?.topic || "general";
      const content = event.data?.content || "";
      const subtype = event.data?.subtype || "pattern";
      const confidence = event.data?.confidence;

      if (!content) continue;

      const metadata: Record<string, unknown> = {};
      if (confidence) metadata.confidence = confidence;

      ctx.insert({
        source: "observations",
        title: `[${subtype}] ${topic}`,
        content,
        topic,
        type: subtype,
        timestamp: event.timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      continue;
    }
  }
}
