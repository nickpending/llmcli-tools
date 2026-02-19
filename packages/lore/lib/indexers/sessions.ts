/**
 * lib/indexers/sessions.ts - Sessions indexer
 *
 * Reads session event JSONL files (hook telemetry) and aggregates by session_id.
 * Each session gets one entry with summary, tools, model, and token counts.
 *
 * Source: sessions
 * Topic: event.project (project the session was in)
 * Type: (empty)
 * Timestamp: first event timestamp per session
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { checkPath, type IndexerContext } from "../indexer";

interface SessionData {
  project: string;
  totalInput: number;
  totalOutput: number;
  toolsUsed: Set<string>;
  model: string | null;
  summary: string | null;
  eventCount: number;
  firstTs: string;
  lastTs: string;
}

export async function indexSessions(ctx: IndexerContext): Promise<void> {
  // Check each event directory individually for clear diagnostics
  const eventDirs: string[] = [];
  for (const { name, path } of [
    { name: "session_events", path: ctx.config.paths.session_events },
    { name: "sable_events", path: ctx.config.paths.sable_events },
  ]) {
    if (checkPath("sessions", name, path)) {
      eventDirs.push(path);
    }
  }

  if (eventDirs.length === 0) return;

  const eventFiles: string[] = [];
  for (const dir of eventDirs) {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f));
    eventFiles.push(...files);
  }
  eventFiles.sort();

  if (eventFiles.length === 0) {
    console.log("No session event files found, skipping sessions");
    return;
  }

  const sessions = new Map<string, SessionData>();

  for (const eventFile of eventFiles) {
    try {
      const lines = readFileSync(eventFile, "utf-8")
        .split("\n")
        .filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const sessionId = event.session_id;
          if (!sessionId) continue;

          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, {
              project: event.project || "unknown",
              totalInput: 0,
              totalOutput: 0,
              toolsUsed: new Set(),
              model: null,
              summary: null,
              eventCount: 0,
              firstTs: event.ts || "",
              lastTs: event.ts || "",
            });
          }

          const session = sessions.get(sessionId)!;
          session.eventCount++;
          if (event.ts) session.lastTs = event.ts;

          const data = event.data || {};
          const tokens = data.tokens || {};
          session.totalInput += tokens.input || 0;
          session.totalOutput += tokens.output || 0;

          const tools: string[] = data.tools_used || [];
          for (const tool of tools) session.toolsUsed.add(tool);

          if (!session.model && data.model) session.model = data.model;
          if (data.summary) session.summary = data.summary;
        } catch {
          continue;
        }
      }
    } catch (e) {
      console.warn(`Failed to read ${eventFile}: ${e}`);
      continue;
    }
  }

  for (const [sessionId, session] of sessions) {
    const tools = Array.from(session.toolsUsed).sort();
    const model = session.model || "unknown";
    const totalTokens = session.totalInput + session.totalOutput;
    const date = session.firstTs.slice(0, 10) || "unknown";

    let content: string;
    if (session.summary) {
      content = `${session.summary} Tools: ${tools.join(", ")}. Model: ${model}. Tokens: ${session.totalInput} input, ${session.totalOutput} output.`;
    } else {
      content = `Session for ${session.project} on ${date}. Tools: ${tools.join(", ")}. Model: ${model}. Events: ${session.eventCount}. Tokens: ${session.totalInput} input, ${session.totalOutput} output.`;
    }

    if (!content) continue;

    ctx.insert({
      source: "sessions",
      title: `[session] ${session.project} (${date})`,
      content,
      topic: session.project,
      timestamp: session.firstTs,
      metadata: {
        session_id: sessionId,
        model,
        tools_used: tools,
        total_tokens: totalTokens,
        event_count: session.eventCount,
      },
    });
  }
}
