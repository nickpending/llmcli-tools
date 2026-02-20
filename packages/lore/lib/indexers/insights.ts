/**
 * lib/indexers/insights.ts - Insights indexer
 *
 * Reads log.jsonl and indexes insight summary captures.
 * Filters for event=captured AND type=insight AND data.subtype=summary.
 *
 * Source: insights
 * Topic: data.topic or "assistant"
 * Type: summary (fixed)
 * Timestamp: event timestamp
 */

import { readFileSync } from "fs";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexInsights(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;
  if (
    !checkPath(
      "insights",
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
      if (event.event !== "captured" || event.type !== "insight") continue;
      if (event.data?.subtype !== "summary") continue;

      const topic = event.data?.topic || "assistant";
      const content = event.data?.content || "";
      const sessionId = event.data?.session_id;

      if (!content) continue;

      const metadata: Record<string, unknown> = {};
      if (sessionId) metadata.session_id = sessionId;

      ctx.insert({
        source: "insights",
        title: topic,
        content,
        topic,
        type: "summary",
        timestamp: event.timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      continue;
    }
  }
}
