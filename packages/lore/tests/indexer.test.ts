import { describe, expect, test, beforeEach } from "bun:test";
// Import db.ts FIRST to ensure Database.setCustomSQLite() is called before any Database instances
import "../lib/db";
import { Database } from "bun:sqlite";
import { createIndexerContext, type IndexEntry } from "../lib/indexer";
import type { LoreConfig } from "../lib/config";

// Mock config for testing
const mockConfig: LoreConfig = {
  paths: {
    data: "/tmp/lore-test",
    obsidian: "/tmp/obsidian",
    explorations: "/tmp/explorations",
    blogs: "/tmp/blogs",
    projects: "/tmp/projects",
    personal: "/tmp/personal",
  },
  database: {
    sqlite: ":memory:", // Use in-memory database for testing
  },
};

function createTestDb(): Database {
  const db = new Database(":memory:");
  // Create FTS5 table matching production schema
  db.run(`
    CREATE VIRTUAL TABLE search USING fts5(
      source,
      title,
      content,
      metadata,
      topic
    )
  `);
  return db;
}

describe("IndexerContext.insert()", () => {
  let db: Database;
  let seenHashes: Set<string>;

  beforeEach(() => {
    db = createTestDb();
    seenHashes = new Set();
  });

  test("inserts entry with content under 2500 chars (no chunking)", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const entry: IndexEntry = {
      source: "test",
      title: "Short Entry",
      content: "This is a short piece of content.",
      topic: "testing",
    };

    ctx.insert(entry);

    const rows = db.query("SELECT * FROM search").all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "test",
      title: "Short Entry",
      content: "This is a short piece of content.",
      topic: "testing",
      metadata: "{}",
    });
  });

  test("chunks content over 2500 chars with 200 char overlap", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    // Create content that's 3000 chars (will need chunking)
    const content = "A".repeat(3000);

    const entry: IndexEntry = {
      source: "test",
      title: "Long Entry",
      content,
      topic: "testing",
    };

    ctx.insert(entry);

    const rows = db.query("SELECT content FROM search").all() as Array<{
      content: string;
    }>;

    // Should have at least 2 chunks
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // First chunk should be ~2500 chars
    expect(rows[0].content.length).toBeLessThanOrEqual(2500);

    // Check overlap exists between chunks
    if (rows.length >= 2) {
      const firstChunkEnd = rows[0].content.slice(-200);
      const secondChunkStart = rows[1].content.slice(0, 200);
      // There should be some overlap (exact match depends on sentence boundary logic)
      expect(secondChunkStart).toContain(firstChunkEnd.slice(-50));
    }
  });

  test("handles content exactly 2500 chars (no chunking)", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const content = "X".repeat(2500);

    const entry: IndexEntry = {
      source: "test",
      title: "Exact Size",
      content,
      topic: "testing",
    };

    ctx.insert(entry);

    const rows = db.query("SELECT * FROM search").all();
    expect(rows).toHaveLength(1); // Should NOT be chunked
    expect((rows[0] as any).content).toBe(content);
  });

  test("deduplicates identical content", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const entry: IndexEntry = {
      source: "test",
      title: "Duplicate",
      content: "Same content",
      topic: "testing",
    };

    ctx.insert(entry);
    ctx.insert(entry); // Insert same entry twice

    const rows = db.query("SELECT * FROM search").all();
    expect(rows).toHaveLength(1); // Should only insert once
  });

  test("warns when topic is in metadata", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const entry: IndexEntry = {
      source: "test",
      title: "Bad Entry",
      content: "Content",
      topic: "testing",
      metadata: {
        topic: "should-not-be-here", // This should trigger warning
      },
    };

    // Capture console.warn output
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = (...args: any[]) => {
      warnCalled = true;
      expect(args[0]).toContain("topic should not be in metadata");
    };

    ctx.insert(entry);

    console.warn = originalWarn;
    expect(warnCalled).toBe(true);
  });

  test("warns when content is in metadata", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const entry: IndexEntry = {
      source: "test",
      title: "Bad Entry",
      content: "Content",
      topic: "testing",
      metadata: {
        content: "should-not-be-here", // This should trigger warning
      },
    };

    // Capture console.warn output
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = (...args: any[]) => {
      warnCalled = true;
      expect(args[0]).toContain("content should not be in metadata");
    };

    ctx.insert(entry);

    console.warn = originalWarn;
    expect(warnCalled).toBe(true);
  });

  test("throws when framework internals are in metadata", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const entry: IndexEntry = {
      source: "test",
      title: "Bad Entry",
      content: "Content",
      topic: "testing",
      metadata: {
        content_hash: "abc123", // Framework internal - should throw
      },
    };

    expect(() => ctx.insert(entry)).toThrow(
      "Framework internal 'content_hash' found in metadata",
    );
  });

  test("includes metadata in JSON format", () => {
    const ctx = createIndexerContext(db, mockConfig, false, seenHashes);

    const entry: IndexEntry = {
      source: "test",
      title: "Entry with Metadata",
      content: "Content",
      topic: "testing",
      metadata: {
        author: "Test Author",
        date: "2026-02-14",
      },
    };

    ctx.insert(entry);

    const rows = db.query("SELECT metadata FROM search").all() as Array<{
      metadata: string;
    }>;
    expect(rows).toHaveLength(1);

    const parsed = JSON.parse(rows[0].metadata);
    expect(parsed).toEqual({
      author: "Test Author",
      date: "2026-02-14",
    });
  });
});
