import { describe, expect, test, beforeEach, afterEach } from "bun:test";
// Import db.ts FIRST to ensure Database.setCustomSQLite() is called before any Database instances
import "../lib/db";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { createIndexerContext } from "../lib/indexer";
import type { LoreConfig } from "../lib/config";
import { indexCaptures } from "../lib/indexers/captures";
import { indexInsights } from "../lib/indexers/insights";
import { indexObservations } from "../lib/indexers/observations";
import { indexTeachings } from "../lib/indexers/teachings";
import { indexSessions } from "../lib/indexers/sessions";
import { indexFlux } from "../lib/indexers/flux";
import { indexExplorations } from "../lib/indexers/explorations";

// Shared helpers

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

function makeConfig(overrides: Partial<LoreConfig["paths"]> = {}): LoreConfig {
  return {
    paths: {
      data: "/tmp/lore-test-missing",
      obsidian: "/tmp/obsidian",
      explorations: "/tmp/explorations-missing",
      blogs: "/tmp/blogs",
      projects: "/tmp/projects-missing",
      personal: "/tmp/personal",
      ...overrides,
    },
    database: {
      sqlite: ":memory:",
    },
  };
}

function makeCtx(db: Database, config: LoreConfig) {
  return createIndexerContext(db, config, false, new Set<string>());
}

function rows(db: Database): any[] {
  return db.query("SELECT * FROM search").all();
}

// ─── Captures ────────────────────────────────────────────────────────────────

describe("captures indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-captures-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("knowledge entry produces type from data.subtype (INV-003)", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    writeFileSync(
      logPath,
      JSON.stringify({
        event: "captured",
        type: "knowledge",
        timestamp: "2026-01-01T10:00:00Z",
        data: {
          topic: "testing",
          subtype: "gotcha",
          content: "Always use Homebrew sqlite on macOS",
        },
      }) + "\n",
    );

    const ctx = makeCtx(db, makeConfig({ data: tmpDir }));
    await indexCaptures(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("gotcha");
    expect(result[0].topic).toBe("testing");
    expect(result[0].source).toBe("captures");
  });

  test("task entry produces type=completion and topic populated (INV-002, INV-003)", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    writeFileSync(
      logPath,
      JSON.stringify({
        event: "captured",
        type: "task",
        timestamp: "2026-01-01T10:00:00Z",
        data: {
          topic: "devtools",
          name: "Fix the build",
          problem: "Build was broken",
          solution: "Updated deps",
        },
      }) + "\n",
    );

    const ctx = makeCtx(db, makeConfig({ data: tmpDir }));
    await indexCaptures(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("completion");
    expect(result[0].topic).toBe("devtools");
    expect(result[0].title).toBe("devtools: Fix the build");
  });

  test("note entry produces type=note (INV-003)", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    writeFileSync(
      logPath,
      JSON.stringify({
        event: "captured",
        type: "note",
        timestamp: "2026-01-01T10:00:00Z",
        data: {
          content: "Remember to check the cache",
          tags: ["performance"],
        },
      }) + "\n",
    );

    const ctx = makeCtx(db, makeConfig({ data: tmpDir }));
    await indexCaptures(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("note");
  });

  test("non-capture events are excluded and missing topic defaults to 'general'", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    const lines = [
      // Should be included: knowledge with no topic
      JSON.stringify({
        event: "captured",
        type: "knowledge",
        timestamp: "2026-01-01T10:00:00Z",
        data: { subtype: "learning", content: "Some learning" },
      }),
      // Should be excluded: wrong event type
      JSON.stringify({
        event: "something_else",
        type: "knowledge",
        timestamp: "2026-01-01T10:00:00Z",
        data: { content: "nope" },
      }),
    ].join("\n");
    writeFileSync(logPath, lines + "\n");

    const ctx = makeCtx(db, makeConfig({ data: tmpDir }));
    await indexCaptures(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("general");
  });

  test("skips gracefully when log.jsonl is missing", async () => {
    const ctx = makeCtx(db, makeConfig({ data: "/tmp/does-not-exist-ever" }));
    await indexCaptures(ctx);

    const result = rows(db);
    expect(result).toHaveLength(0);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Insights ────────────────────────────────────────────────────────────────

describe("insights indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-insights-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("only indexes insight+summary entries, excludes other types (INV-003 filter)", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    const lines = [
      // Should be included: insight+summary
      JSON.stringify({
        event: "captured",
        type: "insight",
        timestamp: "2026-01-01T10:00:00Z",
        data: {
          topic: "refactoring",
          subtype: "summary",
          content: "Refactored the module successfully",
          session_id: "sess-abc",
        },
      }),
      // Should be excluded: insight but NOT summary subtype
      JSON.stringify({
        event: "captured",
        type: "insight",
        timestamp: "2026-01-01T10:01:00Z",
        data: {
          topic: "testing",
          subtype: "analysis",
          content: "Some analysis",
        },
      }),
      // Should be excluded: different event type entirely
      JSON.stringify({
        event: "captured",
        type: "knowledge",
        timestamp: "2026-01-01T10:02:00Z",
        data: { topic: "misc", subtype: "summary", content: "Not an insight" },
      }),
    ].join("\n");
    writeFileSync(logPath, lines + "\n");

    const ctx = makeCtx(db, makeConfig({ data: tmpDir }));
    await indexInsights(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("summary");
    expect(result[0].topic).toBe("refactoring");
    const meta = JSON.parse(result[0].metadata as string);
    expect(meta.session_id).toBe("sess-abc");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Sessions ────────────────────────────────────────────────────────────────

describe("sessions indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-sessions-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("aggregates events by session_id with metadata (INV-002, session grouping)", async () => {
    const eventsDir = join(tmpDir, "session_events");
    mkdirSync(eventsDir, { recursive: true });

    const eventLines = [
      JSON.stringify({
        session_id: "sess-001",
        project: "lore",
        ts: "2026-01-01T10:00:00Z",
        data: {
          tokens: { input: 1000, output: 500 },
          tools_used: ["Read", "Write"],
          model: "claude-sonnet",
        },
      }),
      JSON.stringify({
        session_id: "sess-001",
        project: "lore",
        ts: "2026-01-01T10:01:00Z",
        data: {
          tokens: { input: 200, output: 100 },
          tools_used: ["Bash"],
          model: "claude-sonnet",
        },
      }),
      JSON.stringify({
        session_id: "sess-002",
        project: "other",
        ts: "2026-01-01T11:00:00Z",
        data: {
          tokens: { input: 300, output: 150 },
          tools_used: [],
          model: "claude-opus",
        },
      }),
    ].join("\n");

    writeFileSync(join(eventsDir, "2026-01-01.jsonl"), eventLines + "\n");

    const ctx = makeCtx(db, makeConfig({ session_events: eventsDir } as any));
    await indexSessions(ctx);

    const result = rows(db);
    // Two distinct sessions produce two entries
    expect(result).toHaveLength(2);

    const sess001 = result.find((r: any) => {
      const meta = JSON.parse(r.metadata as string);
      return meta.session_id === "sess-001";
    });
    expect(sess001).toBeDefined();
    expect(sess001.topic).toBe("lore");

    const meta001 = JSON.parse(sess001.metadata as string);
    // Tools combined from both events
    expect(meta001.tools_used).toContain("Read");
    expect(meta001.tools_used).toContain("Bash");
    // Token totals accumulated
    expect(meta001.total_tokens).toBe(1800); // 1000+500+200+100
    expect(meta001.event_count).toBe(2);
  });

  test("skips gracefully when session_events path not configured", async () => {
    // Config without session_events key
    const config = makeConfig();
    // session_events is undefined by default in makeConfig
    const ctx = makeCtx(db, config);
    await indexSessions(ctx);

    const result = rows(db);
    expect(result).toHaveLength(0);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Flux ────────────────────────────────────────────────────────────────────

describe("flux indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-flux-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("parses todo and idea line formats with correct types (INV-003)", async () => {
    const fluxDir = join(tmpDir, "flux");
    mkdirSync(fluxDir, { recursive: true });

    writeFileSync(
      join(fluxDir, "active.md"),
      [
        "- todo:: Fix the broken tests id::abc123 captured::2026-01-01",
        "- idea:: Consider adding a cache layer id::def456",
        "- not a match line",
      ].join("\n") + "\n",
    );

    const ctx = makeCtx(db, makeConfig({ flux: fluxDir } as any));
    await indexFlux(ctx);

    const result = rows(db);
    expect(result).toHaveLength(2);

    const todo = result.find((r: any) => r.type === "todo");
    const idea = result.find((r: any) => r.type === "idea");

    expect(todo).toBeDefined();
    expect(todo.topic).toBe("general"); // general flux dir = "general" topic
    expect(todo.content).toBe("Fix the broken tests");

    expect(idea).toBeDefined();
    expect(idea.type).toBe("idea");
    expect(idea.content).toBe("Consider adding a cache layer");
  });

  test("per-project flux uses project directory name as topic (INV-002)", async () => {
    const projectsDir = join(tmpDir, "projects");
    const myProjectDir = join(projectsDir, "myproject");
    mkdirSync(myProjectDir, { recursive: true });

    writeFileSync(
      join(myProjectDir, "active.md"),
      "- todo:: Implement feature X id::ghi789 captured::2026-01-15\n",
    );

    const ctx = makeCtx(db, makeConfig({ flux_projects: projectsDir } as any));
    await indexFlux(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("myproject");
    expect(result[0].type).toBe("todo");
  });

  test("skips gracefully when flux paths not configured", async () => {
    const ctx = makeCtx(db, makeConfig());
    await indexFlux(ctx);

    const result = rows(db);
    expect(result).toHaveLength(0);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Explorations ────────────────────────────────────────────────────────────

describe("explorations indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-explorations-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("recursive walk finds markdown files in subdirectories (INV-002)", async () => {
    const explorationsDir = join(tmpDir, "explorations");
    const subDir = join(explorationsDir, "databases");
    mkdirSync(subDir, { recursive: true });

    writeFileSync(join(explorationsDir, "top-level.md"), "Top level content\n");
    writeFileSync(join(subDir, "sqlite.md"), "SQLite exploration content\n");

    const ctx = makeCtx(db, makeConfig({ explorations: explorationsDir }));
    await indexExplorations(ctx);

    const result = rows(db);
    expect(result).toHaveLength(2);

    // Topic populated for all entries
    for (const row of result) {
      expect(row.topic).toBeTruthy();
    }

    // Subdirectory file uses parent dir name as topic fallback
    const sqliteEntry = result.find((r: any) =>
      (r.title as string).includes("sqlite"),
    );
    expect(sqliteEntry).toBeDefined();
    expect(sqliteEntry.topic).toBe("databases");
  });

  test("frontmatter project field overrides directory-based topic (INV-002)", async () => {
    const explorationsDir = join(tmpDir, "explorations");
    mkdirSync(explorationsDir, { recursive: true });

    writeFileSync(
      join(explorationsDir, "my-exploration.md"),
      "---\nproject: custom-project\nstatus: draft\n---\nExploration body content\n",
    );

    const ctx = makeCtx(db, makeConfig({ explorations: explorationsDir }));
    await indexExplorations(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("custom-project");
    const meta = JSON.parse(result[0].metadata as string);
    expect(meta.status).toBe("draft");
  });

  test("skips gracefully when explorations directory is missing", async () => {
    const ctx = makeCtx(
      db,
      makeConfig({ explorations: "/tmp/no-such-dir-explorations" }),
    );
    await indexExplorations(ctx);

    const result = rows(db);
    expect(result).toHaveLength(0);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Observations ────────────────────────────────────────────────────────────

describe("observations indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-observations-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("type comes from data.subtype, defaults to 'pattern' when missing (INV-003)", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    const lines = [
      JSON.stringify({
        event: "captured",
        type: "observation",
        timestamp: "2026-01-01T10:00:00Z",
        data: {
          topic: "coding",
          subtype: "style",
          content: "Use const by default",
        },
      }),
      JSON.stringify({
        event: "captured",
        type: "observation",
        timestamp: "2026-01-01T10:01:00Z",
        data: { topic: "coding", content: "No subtype provided here" },
      }),
    ].join("\n");
    writeFileSync(logPath, lines + "\n");

    const ctx = makeCtx(db, makeConfig({ data: tmpDir }));
    await indexObservations(ctx);

    const result = rows(db);
    expect(result).toHaveLength(2);

    const styleEntry = result.find((r: any) => r.type === "style");
    const patternEntry = result.find((r: any) => r.type === "pattern");

    expect(styleEntry).toBeDefined();
    expect(patternEntry).toBeDefined();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
