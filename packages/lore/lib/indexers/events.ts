/**
 * lib/indexers/events.ts - Events indexer
 *
 * Aggregates development events from log.jsonl by project.
 * Each project gets one entry with all event lines.
 *
 * Source: events
 * Topic: project name
 * Type: (empty)
 * Timestamp: last event timestamp per project
 */

import { readFileSync } from "fs";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexEvents(ctx: IndexerContext): Promise<void> {
  const logPath = `${ctx.config.paths.data}/log.jsonl`;
  if (
    !checkPath(
      "events",
      "log.jsonl",
      logPath,
      "populated by Sable session hooks",
    )
  )
    return;

  const lines = readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  const projectData = new Map<
    string,
    { lines: string[]; lastTimestamp: string }
  >();

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const project = event.data?.topic || "general";
      if (!projectData.has(project)) {
        projectData.set(project, { lines: [], lastTimestamp: "" });
      }
      const data = projectData.get(project)!;
      data.lines.push(
        `[${event.timestamp}] ${event.event}: ${event.type || ""}`,
      );
      if (event.timestamp) {
        data.lastTimestamp = event.timestamp;
      }
    } catch {
      // Skip malformed JSON
      continue;
    }
  }

  for (const [project, data] of projectData) {
    const content = data.lines.join("\n");

    ctx.insert({
      source: "events",
      title: `Development events: ${project}`,
      content,
      topic: project,
      timestamp: data.lastTimestamp,
    });
  }
}
