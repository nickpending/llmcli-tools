import { describe, expect, test, beforeEach } from "bun:test";
// Import db.ts FIRST to ensure Database.setCustomSQLite() is called before any Database instances
import "../lib/db";
import { Database } from "bun:sqlite";
import {
  getContentForEmbedding,
  insertSearchEntry,
  extractType,
} from "../lib/realtime";
import { getSourceForEvent } from "../lib/source-map";
import { SOURCES } from "../lib/list";
import { isValidLoreType } from "../lib/types";
import type { CaptureEvent, KnowledgeCaptureType } from "../lib/capture";

/**
 * Helper: create FTS5 search table matching production schema
 */
function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE VIRTUAL TABLE search USING fts5(
      source,
      title,
      content,
      metadata,
      topic,
      type,
      timestamp
    )
  `);
  return db;
}

/**
 * Representative capture events covering all CaptureEvent union members.
 * Used across multiple invariant tests.
 */
const ALL_EVENT_TYPES: CaptureEvent[] = [
  {
    event: "captured",
    type: "knowledge",
    timestamp: "2026-03-07T00:00:00.000Z",
    data: {
      topic: "sqlite",
      content: "FTS5 supports prefix queries",
      subtype: "learning",
    },
  },
  {
    event: "captured",
    type: "teaching",
    timestamp: "2026-03-07T00:00:00.000Z",
    data: {
      topic: "testing",
      confidence: "high",
      content: "Always test invariants not implementation details",
      source: "manual",
    },
  },
  {
    event: "captured",
    type: "observation",
    timestamp: "2026-03-07T00:00:00.000Z",
    data: {
      topic: "workflows",
      content: "User prefers uv over pip",
      subtype: "preference",
      confidence: "stated",
      source: "auto",
    },
  },
  {
    event: "captured",
    type: "insight",
    timestamp: "2026-03-07T00:00:00.000Z",
    data: {
      session_id: "abc-123",
      topic: "architecture",
      subtype: "decision",
      content: "Keep embedding and search in separate tables",
      source: "auto",
    },
  },
  {
    event: "captured",
    type: "task",
    timestamp: "2026-03-07T00:00:00.000Z",
    data: {
      topic: "lore",
      name: "add-invariant-tests",
      problem: "No test coverage on hardening invariants",
      solution: "Write 6 invariant tests",
    },
  },
  {
    event: "captured",
    type: "note",
    timestamp: "2026-03-07T00:00:00.000Z",
    data: {
      content: "Remember to check embedding format matches Python",
      tags: ["lore", "testing"],
      topic: "dev-notes",
    },
  },
];

describe("Invariant: Embedding format consistency", () => {
  test("getContentForEmbedding produces 'type topic content' format matching lore-embed-all", () => {
    // Python lore-embed-all format: f"{type} {topic} {content}"
    // TS must produce the same format for vector consistency
    const event: CaptureEvent = {
      event: "captured",
      type: "knowledge",
      timestamp: "2026-03-07T00:00:00.000Z",
      data: {
        topic: "sqlite",
        content: "FTS5 supports prefix queries",
        subtype: "decision",
      },
    };

    const result = getContentForEmbedding(event);

    // extractType for knowledge with subtype "decision" returns "decision"
    // Format must be: "decision sqlite FTS5 supports prefix queries"
    expect(result).toBe("decision sqlite FTS5 supports prefix queries");

    // Verify the structure: type + space + topic + space + content
    const type = extractType(event);
    const expectedFormat = `${type} ${event.data.topic} ${event.data.content}`;
    expect(result).toBe(expectedFormat);
  });

  test("getContentForEmbedding handles missing topic gracefully", () => {
    const event: CaptureEvent = {
      event: "captured",
      type: "note",
      timestamp: "2026-03-07T00:00:00.000Z",
      data: {
        content: "A quick note without topic",
      },
    };

    const result = getContentForEmbedding(event);

    // With empty topic, should produce "type content" (topic filtered out)
    expect(result).toBe("note A quick note without topic");
    // Must NOT have double spaces from empty topic
    expect(result).not.toMatch(/  /);
  });

  test("all event types produce non-empty embedding content with type and topic", () => {
    for (const event of ALL_EVENT_TYPES) {
      const result = getContentForEmbedding(event);
      expect(result.length).toBeGreaterThan(0);
      // Must always start with the type
      const type = extractType(event);
      expect(result.startsWith(type)).toBe(true);
      // Must contain the topic (if present) to catch silent topic-dropping
      const data = event.data as Record<string, unknown>;
      const topic = String(data.topic || "");
      if (topic) {
        expect(result).toContain(topic);
      }
    }
  });
});

describe("Invariant: FTS5 raw content", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("insertSearchEntry stores raw data.content, NOT prefixed embedding content", () => {
    const event: CaptureEvent = {
      event: "captured",
      type: "knowledge",
      timestamp: "2026-03-07T00:00:00.000Z",
      data: {
        topic: "sqlite",
        content: "FTS5 supports prefix queries",
        subtype: "learning",
      },
    };

    insertSearchEntry(db, event);

    const rows = db.query("SELECT content FROM search").all() as Array<{
      content: string;
    }>;

    expect(rows).toHaveLength(1);
    // FTS5 must store the raw content, NOT the embedding-prefixed version
    expect(rows[0].content).toBe("FTS5 supports prefix queries");

    // Verify it differs from the embedding format
    const embeddingContent = getContentForEmbedding(event);
    expect(rows[0].content).not.toBe(embeddingContent);
  });
});

describe("Invariant: LoreType enum completeness", () => {
  // GAP: "note", "project", "conversation" are produced by extractType but missing
  // from LoreType enum. These are known gaps — tracked for future fix.
  // This test covers types that ARE in the enum today and will catch regressions
  // if any currently-valid mapping breaks.

  test("extractType produces values recognized by isValidLoreType for ALL event types", () => {
    for (const event of ALL_EVENT_TYPES) {
      const type = extractType(event);
      expect(isValidLoreType(type)).toBe(true);
    }
  });

  test("note/project/conversation types are in LoreType enum", () => {
    const noteEvent: CaptureEvent = {
      event: "captured",
      type: "note",
      timestamp: "2026-03-07T00:00:00.000Z",
      data: { content: "test" },
    };
    expect(isValidLoreType(extractType(noteEvent))).toBe(true);

    const projectEvent: CaptureEvent = {
      event: "captured",
      type: "knowledge",
      timestamp: "2026-03-07T00:00:00.000Z",
      data: { topic: "test", content: "test", subtype: "project" },
    };
    expect(isValidLoreType(extractType(projectEvent))).toBe(true);

    const conversationEvent: CaptureEvent = {
      event: "captured",
      type: "knowledge",
      timestamp: "2026-03-07T00:00:00.000Z",
      data: { topic: "test", content: "test", subtype: "conversation" },
    };
    expect(isValidLoreType(extractType(conversationEvent))).toBe(true);
  });

  test("knowledge subtypes in LoreType enum produce valid types", () => {
    // Knowledge events use data.subtype as their type
    // Only test subtypes that are in the LoreType enum
    const validKnowledgeSubtypes: KnowledgeCaptureType[] = [
      "decision",
      "learning",
      "gotcha",
      "preference",
      "knowledge",
    ];

    for (const subtype of validKnowledgeSubtypes) {
      const event: CaptureEvent = {
        event: "captured",
        type: "knowledge",
        timestamp: "2026-03-07T00:00:00.000Z",
        data: { topic: "test", content: "test", subtype },
      };

      const type = extractType(event);
      expect(type).toBe(subtype);
      expect(isValidLoreType(type)).toBe(true);
    }
  });
});

describe("Invariant: Source mapping", () => {
  test("getSourceForEvent maps indexable CaptureEvent types to values in SOURCES array", () => {
    // insight events are not indexed — getSourceForEvent throws on them
    const indexableEvents = ALL_EVENT_TYPES.filter((e) => e.type !== "insight");
    for (const event of indexableEvents) {
      const source = getSourceForEvent(event);
      expect(SOURCES).toContain(source);
    }
  });

  test("getSourceForEvent throws on insight events (not indexed)", () => {
    const insightEvent = ALL_EVENT_TYPES.find((e) => e.type === "insight")!;
    expect(() => getSourceForEvent(insightEvent)).toThrow(
      "insight events should not be indexed",
    );
  });
});

describe("Invariant: Capture to search entry pipeline", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("round-trip from event through insertSearchEntry to FTS5 query", () => {
    const event: CaptureEvent = {
      event: "captured",
      type: "knowledge",
      timestamp: "2026-03-07T12:00:00.000Z",
      data: {
        topic: "bun-sqlite",
        content: "Bun SQLite supports FTS5 out of the box",
        subtype: "learning",
      },
    };

    const rowid = insertSearchEntry(db, event);
    expect(rowid).toBeGreaterThan(0);

    // Query back by FTS5 match
    const rows = db
      .query(
        "SELECT source, title, content, topic, type, timestamp FROM search WHERE search MATCH ?",
      )
      .all("FTS5") as Array<{
      source: string;
      title: string;
      content: string;
      topic: string;
      type: string;
      timestamp: string;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("captures"); // knowledge -> captures
    expect(rows[0].content).toBe("Bun SQLite supports FTS5 out of the box");
    expect(rows[0].topic).toBe("bun-sqlite");
    expect(rows[0].type).toBe("learning");
    expect(rows[0].timestamp).toBe("2026-03-07T12:00:00.000Z");
  });
});

describe("Invariant: No dead sources", () => {
  test("every source from getSourceForEvent exists in SOURCES array", () => {
    // insight events are not indexed — getSourceForEvent throws on them
    const indexableEvents = ALL_EVENT_TYPES.filter((e) => e.type !== "insight");
    const producedSources = new Set<string>();

    for (const event of indexableEvents) {
      producedSources.add(getSourceForEvent(event));
    }

    // Every produced source must exist in the SOURCES array
    for (const source of producedSources) {
      expect(SOURCES).toContain(source);
    }

    // Verify we tested all event types (guard against ALL_EVENT_TYPES going stale)
    // 5 indexable + 1 non-indexable (insight) = 6 total
    const eventTypes = new Set(ALL_EVENT_TYPES.map((e) => e.type));
    expect(eventTypes.size).toBe(6); // knowledge, teaching, observation, insight, task, note
  });
});
