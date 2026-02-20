/**
 * lib/indexers/captures.ts - Captures indexer
 *
 * Reads log.jsonl and indexes knowledge, task, and note captures.
 * Filters for event=captured AND type in [knowledge, task, note].
 *
 * Source: captures
 * Topic: data.topic (AI-written)
 * Type: completion (task), note (note), or data.subtype (knowledge)
 * Timestamp: event timestamp
 */

import { readFileSync } from "fs";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexCaptures(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;
  if (
    !checkPath(
      "captures",
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
      if (event.event !== "captured") continue;

      const eventType = event.type;
      if (!["knowledge", "task", "note"].includes(eventType)) continue;

      const topic = event.data?.topic || "general";
      let content = "";
      let title = "";
      const metadata: Record<string, unknown> = {};
      let type = "";

      if (eventType === "task") {
        const name = event.data?.name || "untitled";
        const problem = event.data?.problem || "";
        const solution = event.data?.solution || "";
        const code = event.data?.code || "";
        const discoveries = event.data?.discoveries?.join(", ") || "";
        const deviations = event.data?.deviations || "";
        const pattern = event.data?.pattern || "";
        const difficulty = event.data?.difficulty || "";

        content = `Problem: ${problem}`;
        if (solution) content += `\nSolution: ${solution}`;
        if (code) content += `\nCode: ${code}`;
        if (discoveries) content += `\nDiscoveries: ${discoveries}`;
        if (deviations) content += `\nDeviations: ${deviations}`;
        if (pattern) content += `\nPattern: ${pattern}`;

        const techTags: string[] = [];
        if (event.data?.tech) techTags.push(`Tech: ${event.data.tech}`);
        if (event.data?.tags) {
          const tags = Array.isArray(event.data.tags)
            ? event.data.tags
            : [event.data.tags];
          techTags.push(`Tags: ${tags.join(", ")}`);
        }
        if (techTags.length > 0) content += `\n${techTags.join("\n")}`;

        title = `${topic}: ${name}`;
        type = "completion";

        if (event.data?.tags) metadata.tags = event.data.tags;
        if (event.data?.tech) metadata.tech = event.data.tech;
        if (difficulty) metadata.difficulty = difficulty;
      } else if (eventType === "note") {
        content = event.data?.content || "";
        const tags = event.data?.tags || [];
        const tagsStr = tags.join(", ");

        title = tagsStr ? tagsStr : "untagged";
        type = "note";

        if (tags.length > 0) metadata.tags = tags;
      } else {
        // knowledge
        content = event.data?.content || "";
        const subtype = event.data?.subtype || "insight";

        title = topic;
        type = subtype;
      }

      if (!content) continue;

      ctx.insert({
        source: "captures",
        title,
        content,
        topic,
        type,
        timestamp: event.timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      continue;
    }
  }
}
