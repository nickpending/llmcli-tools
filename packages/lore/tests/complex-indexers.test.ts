import { describe, expect, test, beforeEach, afterEach } from "bun:test";
// Import db.ts FIRST to ensure Database.setCustomSQLite() is called before any Database instances
import "../lib/db";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync, utimesSync } from "fs";
import { join } from "path";
import { createIndexerContext } from "../lib/indexer";
import type { LoreConfig } from "../lib/config";
import { indexObsidian } from "../lib/indexers/obsidian";
import { indexCommits } from "../lib/indexers/commits";
import { indexBlogs } from "../lib/indexers/blogs";
import { indexPersonal } from "../lib/indexers/personal";

// ─── Shared helpers ────────────────────────────────────────────────────────────

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
      obsidian: "/tmp/obsidian-missing",
      explorations: "/tmp/explorations-missing",
      blogs: "/tmp/blogs-missing",
      projects: "/tmp/projects-missing",
      personal: "/tmp/personal-missing",
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

// ─── Obsidian Indexer ─────────────────────────────────────────────────────────

describe("obsidian indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-obsidian-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("skips notes with private:true frontmatter (privacy invariant)", async () => {
    const vaultDir = join(tmpDir, "vault");
    mkdirSync(vaultDir, { recursive: true });

    // Private note — must be excluded
    writeFileSync(
      join(vaultDir, "private-note.md"),
      "---\nprivate: true\ntitle: Secret\n---\nThis is private content\n",
    );

    // Public note — must be included
    writeFileSync(
      join(vaultDir, "public-note.md"),
      "---\ntitle: Public\n---\nThis is public content\n",
    );

    const ctx = makeCtx(db, makeConfig({ obsidian: vaultDir }));
    await indexObsidian(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect((result[0].title as string).includes("private-note")).toBe(false);
    expect((result[0].title as string).includes("public-note")).toBe(true);
  });

  test("timestamp cascade: frontmatter date > started > file mtime", async () => {
    const vaultDir = join(tmpDir, "vault");
    mkdirSync(vaultDir, { recursive: true });

    // Note with explicit date — should use frontmatter date
    writeFileSync(
      join(vaultDir, "dated-note.md"),
      "---\ndate: 2024-06-15\n---\nContent with date frontmatter\n",
    );

    // Note with started but no date — should use started
    writeFileSync(
      join(vaultDir, "started-note.md"),
      "---\nstarted: 2023-03-10\n---\nContent with started frontmatter\n",
    );

    // Note with no date frontmatter — should use file mtime
    const noDatePath = join(vaultDir, "no-date-note.md");
    writeFileSync(noDatePath, "No frontmatter at all\n");
    // Set mtime to a known date (2022-01-01)
    const knownMtime = new Date("2022-01-01T00:00:00Z");
    utimesSync(noDatePath, knownMtime, knownMtime);

    const ctx = makeCtx(db, makeConfig({ obsidian: vaultDir }));
    await indexObsidian(ctx);

    const result = rows(db);
    expect(result).toHaveLength(3);

    const dated = result.find((r: any) => r.title === "dated-note");
    const started = result.find((r: any) => r.title === "started-note");
    const noDate = result.find((r: any) => r.title === "no-date-note");

    expect(dated).toBeDefined();
    expect((dated.timestamp as string).startsWith("2024-06-15")).toBe(true);

    expect(started).toBeDefined();
    expect((started.timestamp as string).startsWith("2023-03-10")).toBe(true);

    expect(noDate).toBeDefined();
    expect((noDate.timestamp as string).startsWith("2022-01-01")).toBe(true);
  });

  test("inline tags extracted and appended to content", async () => {
    const vaultDir = join(tmpDir, "vault");
    mkdirSync(vaultDir, { recursive: true });

    writeFileSync(
      join(vaultDir, "tagged-note.md"),
      "---\ntags: [typescript, testing, bun]\n---\nNote body content here\n",
    );

    const ctx = makeCtx(db, makeConfig({ obsidian: vaultDir }));
    await indexObsidian(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);
    expect(result[0].content as string).toContain(
      "Tags: typescript, testing, bun",
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Commits Indexer ──────────────────────────────────────────────────────────

describe("commits indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-commits-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("author name prepended to content and topic equals repo name (INV-002)", async () => {
    // Create a real git repo with a commit so we can test the actual indexer output
    const projectsDir = join(tmpDir, "projects");
    const repoDir = join(projectsDir, "myrepo");
    mkdirSync(repoDir, { recursive: true });

    // Initialize a git repo with a commit
    const { spawnSync } = await import("child_process");
    spawnSync("git", ["init"], { cwd: repoDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], {
      cwd: repoDir,
    });
    spawnSync("git", ["config", "user.name", "Test Author"], { cwd: repoDir });
    writeFileSync(join(repoDir, "README.md"), "# Test Repo\n");
    spawnSync("git", ["add", "."], { cwd: repoDir });
    spawnSync("git", ["commit", "-m", "Initial commit"], { cwd: repoDir });

    const ctx = makeCtx(db, makeConfig({ projects: projectsDir }));
    await indexCommits(ctx);

    const result = rows(db);
    expect(result.length).toBeGreaterThanOrEqual(1);

    // Every commit must have non-empty topic equal to repo name (INV-002)
    for (const row of result) {
      expect(row.topic).toBe("myrepo");
    }

    // Author must appear in content
    expect(result[0].content as string).toContain("Author: Test Author");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Blogs Indexer ────────────────────────────────────────────────────────────

describe("blogs indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-blogs-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("tags appended to content and URL derived from filename (not slug)", async () => {
    const blogsDir = join(tmpDir, "blog");
    const postsDir = join(blogsDir, "content", "posts");
    mkdirSync(postsDir, { recursive: true });

    // Post with tags and no slug — URL must come from filename
    writeFileSync(
      join(postsDir, "my-great-post.md"),
      [
        "---",
        "title: My Great Post",
        "date: 2024-05-01",
        "categories: [engineering]",
        "tags: [typescript, performance, caching]",
        "---",
        "Post body content here.",
      ].join("\n") + "\n",
    );

    const ctx = makeCtx(db, makeConfig({ blogs: blogsDir }));
    await indexBlogs(ctx);

    const result = rows(db);
    expect(result).toHaveLength(1);

    // Tags must be in content
    expect(result[0].content as string).toContain(
      "Tags: typescript, performance, caching",
    );

    // URL derived from filename, not slug
    const meta = JSON.parse(result[0].metadata as string);
    expect(meta.url).toBe("https://labs.voidwire.info/posts/my-great-post/");

    // Topic from categories
    expect(result[0].topic).toBe("engineering");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Personal Indexer ─────────────────────────────────────────────────────────

describe("personal indexer", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = `/tmp/lore-test-personal-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
  });

  test("all 8 types produced with non-empty type (INV-003)", async () => {
    const personalDir = join(tmpDir, "personal");
    mkdirSync(personalDir, { recursive: true });

    writeFileSync(
      join(personalDir, "books.json"),
      JSON.stringify([{ title: "Clean Code", author: "Robert C. Martin" }]),
    );
    writeFileSync(
      join(personalDir, "people.json"),
      JSON.stringify([{ name: "Alice Example" }]),
    );
    writeFileSync(
      join(personalDir, "movies.json"),
      JSON.stringify([{ title: "The Matrix", year: 1999 }]),
    );
    writeFileSync(
      join(personalDir, "podcasts.json"),
      JSON.stringify([{ title: "Software Engineering Daily" }]),
    );
    writeFileSync(
      join(personalDir, "interests.json"),
      JSON.stringify(["distributed systems", "language design"]),
    );
    writeFileSync(
      join(personalDir, "habits.json"),
      JSON.stringify([{ habit: "Daily reading", frequency: "daily" }]),
    );
    writeFileSync(
      join(personalDir, "profile.json"),
      JSON.stringify({ name: "Test User", role: "engineer" }),
    );
    writeFileSync(
      join(personalDir, "preferences.json"),
      JSON.stringify({ editor: { theme: "dark", font_size: "14" } }),
    );

    const ctx = makeCtx(db, makeConfig({ personal: personalDir }));
    await indexPersonal(ctx);

    const result = rows(db);

    // All entries must have non-empty type
    for (const row of result) {
      expect(row.type).toBeTruthy();
    }

    // All 8 types must be present
    const types = new Set(result.map((r: any) => r.type));
    const expectedTypes = [
      "book",
      "person",
      "movie",
      "podcast",
      "interest",
      "habit",
      "profile",
      "preference",
    ];
    for (const expectedType of expectedTypes) {
      expect(types.has(expectedType)).toBe(true);
    }
  });

  test("books use date_read for timestamp, podcasts use title field", async () => {
    const personalDir = join(tmpDir, "personal");
    mkdirSync(personalDir, { recursive: true });

    writeFileSync(
      join(personalDir, "books.json"),
      JSON.stringify([
        {
          title: "Refactoring",
          author: "Martin Fowler",
          date_read: "2023-08-20",
        },
      ]),
    );
    writeFileSync(
      join(personalDir, "podcasts.json"),
      JSON.stringify([{ title: "Lex Fridman Podcast" }]),
    );

    const ctx = makeCtx(db, makeConfig({ personal: personalDir }));
    await indexPersonal(ctx);

    const result = rows(db);
    expect(result).toHaveLength(2);

    const book = result.find((r: any) => r.type === "book");
    expect(book).toBeDefined();
    // date_read must be used for book timestamp
    expect((book.timestamp as string).startsWith("2023-08-20")).toBe(true);

    const podcast = result.find((r: any) => r.type === "podcast");
    expect(podcast).toBeDefined();
    // podcast.title field (not podcast.name) must be the title
    expect(podcast.title as string).toContain("Lex Fridman Podcast");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
