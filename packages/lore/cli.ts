#!/usr/bin/env bun
/**
 * lore - Unified knowledge CLI
 *
 * Philosophy:
 * - Single entry point for knowledge operations
 * - Search, list, and capture indexed knowledge
 * - JSON output for composability
 *
 * Usage:
 *   lore search <query>                   Search all sources
 *   lore search <source> <query>          Search specific source
 *   lore list <source>                    List source entries
 *   lore capture task|knowledge|note|teaching  Capture knowledge
 *
 * Exit codes:
 *   0 - Success
 *   1 - Validation error
 *   2 - Runtime error
 */

import {
  search,
  searchPrismis,
  searchAtuin,
  listSources,
  list,
  formatBriefList,
  info,
  formatInfoHuman,
  projects,
  about,
  formatBriefAbout,
  captureTask,
  captureKnowledge,
  captureNote,
  captureTeaching,
  captureObservation,
  indexAndEmbed,
  semanticSearch,
  hybridSearch,
  formatBriefSearch,
  hasEmbeddings,
  SOURCES,
  type SearchResult,
  type HybridResult,
  type ListResult,
  type ListEntry,
  type Source,
  type TaskInput,
  type KnowledgeInput,
  type NoteInput,
  type TeachingInput,
  type KnowledgeCaptureType,
  type ObservationInput,
  type ObservationSubtype,
  type ObservationConfidence,
} from "./index";
import { isValidLoreType, LORE_TYPES } from "./lib/types";

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        parsed.set(k, v);
        i++;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed.set(key, args[i + 1]);
        i += 2;
      } else {
        parsed.set(key, "true");
        i++;
      }
    } else {
      i++;
    }
  }

  return parsed;
}

// Boolean flags that don't take values
const BOOLEAN_FLAGS = new Set([
  "help",
  "sources",
  "domains",
  "exact",
  "semantic",
  "brief",
]);

function getPositionalArgs(args: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const flag = arg.slice(2).split("=")[0]; // Handle --flag=value format
      if (BOOLEAN_FLAGS.has(flag) || arg.includes("=")) {
        i += 1; // Boolean flag or --flag=value, skip only the flag
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i += 2; // Flag with separate value, skip both
      } else {
        i += 1; // Flag at end or followed by another flag
      }
      continue;
    }
    result.push(arg);
    i++;
  }
  return result;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`) || args.includes(`-${flag.charAt(0)}`);
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

// ============================================================================
// Output Helpers
// ============================================================================

interface OutputResult {
  success: boolean;
  [key: string]: unknown;
}

function output(result: OutputResult): void {
  console.log(JSON.stringify(result, null, 2));
}

function fail(error: string, code: number = 1): never {
  output({ success: false, error });
  console.error(`❌ ${error}`);
  process.exit(code);
}

// ============================================================================
// Search Command
// ============================================================================

async function handleSearch(args: string[]): Promise<void> {
  if (hasFlag(args, "help")) {
    showSearchHelp();
  }

  const parsed = parseArgs(args);
  const positional = getPositionalArgs(args);
  const exact = hasFlag(args, "exact");
  const semanticOnly = hasFlag(args, "semantic");

  // Handle --sources flag
  if (hasFlag(args, "sources")) {
    const indexed = listSources();
    const passthrough = [
      { source: "prismis", count: null, type: "passthrough" },
      { source: "atuin", count: null, type: "passthrough" },
    ];
    const sources = [
      ...indexed.map((s) => ({ ...s, type: "indexed" })),
      ...passthrough,
    ];
    output({ success: true, sources });
    console.error(
      `✅ ${indexed.length} indexed sources + ${passthrough.length} passthrough`,
    );
    process.exit(0);
  }

  if (positional.length === 0) {
    fail("Missing search query. Use: lore search <query>");
  }

  // Determine source and query
  let source: string | undefined;
  let query: string;

  if (positional.length === 1) {
    query = positional[0];
  } else {
    source = positional[0];
    query = positional.slice(1).join(" ");
  }

  const limit = parsed.has("limit") ? parseInt(parsed.get("limit")!, 10) : 20;
  const since = parsed.get("since");
  const project = parsed.get("project");
  const type = parseList(parsed.get("type"));

  // Validate type values against LoreType enum
  if (type) {
    const invalid = type.filter((t) => !isValidLoreType(t));
    if (invalid.length > 0) {
      fail(
        `Invalid type: ${invalid.join(", ")}. Valid types: ${LORE_TYPES.join(", ")}`,
      );
    }
  }

  // Handle prismis passthrough
  if (source === "prismis") {
    searchPrismis(query, { limit })
      .then((results) => {
        output({
          success: true,
          results,
          count: results.length,
        });
        console.error(
          `✅ ${results.length} result${results.length !== 1 ? "s" : ""} found`,
        );
        process.exit(0);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fail(message, 2);
      });
    return;
  }

  // Handle atuin passthrough
  if (source === "atuin") {
    try {
      const results = searchAtuin(query, { limit });
      output({
        success: true,
        results,
        count: results.length,
      });
      console.error(
        `✅ ${results.length} result${results.length !== 1 ? "s" : ""} found`,
      );
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      fail(message, 2);
    }
    return;
  }

  // FTS5 path (explicit --exact only)
  if (exact) {
    try {
      const results = search(query, { source, limit, since, type });
      output({
        success: true,
        results,
        count: results.length,
        mode: "exact",
      });
      console.error(
        `✅ ${results.length} result${results.length !== 1 ? "s" : ""} found (exact)`,
      );
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      fail(message, 2);
    }
    return;
  }

  // Check embeddings for semantic/hybrid modes
  if (!hasEmbeddings()) {
    fail("No embeddings found. Run lore-embed-all first.", 2);
  }

  const brief = hasFlag(args, "brief");

  // Semantic-only path (explicit --semantic)
  if (semanticOnly) {
    try {
      const results = await semanticSearch(query, {
        source,
        limit,
        project,
        type,
      });

      if (brief) {
        console.log(formatBriefSearch(results));
      } else {
        output({
          success: true,
          results,
          count: results.length,
          mode: "semantic",
        });
      }
      console.error(
        `✅ ${results.length} result${results.length !== 1 ? "s" : ""} found (semantic)`,
      );
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      fail(`Semantic search failed: ${message}`, 2);
    }
    return;
  }

  // Hybrid path (default) - combines vector + keyword
  try {
    const results = await hybridSearch(query, {
      source,
      limit,
      project,
      since,
      type,
    });

    if (brief) {
      // Format hybrid results for brief output (reuse semantic formatter)
      const asSemanticResults = results.map((r) => ({
        ...r,
        distance: 1 - r.score, // Convert score back to distance-like for formatter
      }));
      console.log(formatBriefSearch(asSemanticResults));
    } else {
      output({
        success: true,
        results,
        count: results.length,
        mode: "hybrid",
      });
    }
    console.error(
      `✅ ${results.length} result${results.length !== 1 ? "s" : ""} found (hybrid)`,
    );
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(`Hybrid search failed: ${message}`, 2);
  }
}

// ============================================================================
// List Command
// ============================================================================

function formatHumanOutput(result: ListResult): string {
  const lines: string[] = [`${result.source} (${result.count} entries):`, ""];

  for (const entry of result.entries) {
    lines.push(`  ${entry.title}`);
    if (entry.metadata.description) {
      lines.push(`    ${entry.metadata.description}`);
    }
  }

  return lines.join("\n");
}

function handleList(args: string[]): void {
  if (hasFlag(args, "help")) {
    showListHelp();
  }

  const parsed = parseArgs(args);
  const positional = getPositionalArgs(args);

  // Handle --domains flag (deprecated)
  if (hasFlag(args, "domains")) {
    console.error("⚠️  --domains is deprecated. Use 'lore sources' instead.");
    const sources = listSources();
    output({ success: true, sources });
    console.error(`✅ ${SOURCES.length} sources available`);
    process.exit(0);
  }

  if (positional.length === 0) {
    fail(`Missing source. Available: ${SOURCES.join(", ")}`);
  }

  const source = positional[0] as Source;

  if (!SOURCES.includes(source)) {
    fail(`Invalid source: ${source}. Available: ${SOURCES.join(", ")}`);
  }

  const limit = parsed.has("limit")
    ? parseInt(parsed.get("limit")!, 10)
    : undefined;
  const format = parsed.get("format") || "json";
  const project = parsed.get("project");
  const type = parsed.get("type");
  const brief = hasFlag(args, "brief");

  try {
    const result = list(source, { limit, project, type });

    if (brief) {
      console.log(formatBriefList(result));
    } else if (format === "human") {
      console.log(formatHumanOutput(result));
    } else if (format === "jsonl") {
      for (const entry of result.entries) {
        console.log(JSON.stringify(entry));
      }
    } else {
      output({
        success: true,
        source: result.source,
        entries: result.entries,
        count: result.count,
      });
    }

    console.error(`✅ ${result.count} entries in ${source}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(message, 2);
  }
}

// ============================================================================
// Info Command
// ============================================================================

function handleInfo(args: string[]): void {
  if (hasFlag(args, "help")) {
    showInfoHelp();
  }

  const human = hasFlag(args, "human");

  try {
    const result = info();

    if (human) {
      console.log(formatInfoHuman(result));
    } else {
      output({
        success: true,
        ...result,
      });
    }

    console.error(
      `✅ ${result.sources.length} sources, ${result.total_entries} total entries`,
    );
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(message, 2);
  }
}

// ============================================================================
// Projects Command
// ============================================================================

function handleProjects(args: string[]): void {
  if (hasFlag(args, "help")) {
    showProjectsHelp();
  }

  try {
    const result = projects();

    output({
      success: true,
      projects: result,
    });

    console.error(`✅ ${result.length} projects found`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(message, 2);
  }
}

// ============================================================================
// About Command
// ============================================================================

function handleAbout(args: string[]): void {
  if (hasFlag(args, "help")) {
    showAboutHelp();
  }

  const parsed = parseArgs(args);
  const positional = getPositionalArgs(args);

  if (positional.length === 0) {
    fail("Missing project name. Use: lore about <project>");
  }

  const project = positional[0];
  const brief = hasFlag(args, "brief");
  const limit = parsed.has("limit")
    ? parseInt(parsed.get("limit")!, 10)
    : undefined;

  try {
    const result = about(project, { brief, limit });

    if (brief) {
      console.log(formatBriefAbout(result));
    } else {
      output({
        success: true,
        ...result,
      });
    }

    const totalCount =
      result.commits.count +
      result.captures.count +
      result.flux.count +
      result.teachings.count +
      result.sessions.count;

    console.error(`✅ ${totalCount} entries for project: ${project}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(message, 2);
  }
}

// ============================================================================
// Sources Command
// ============================================================================

function handleSources(args: string[]): void {
  if (hasFlag(args, "help")) {
    showSourcesHelp();
  }

  try {
    const sources = listSources();
    output({
      success: true,
      sources,
    });
    console.error(`✅ ${sources.length} sources indexed`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(message, 2);
  }
}

function showSourcesHelp(): void {
  console.log(`
lore sources - List all indexed sources with counts

Usage:
  lore sources                          List all sources with entry counts

Options:
  --help            Show this help

Output:
  JSON array of {source, count} objects, sorted by count descending.

Examples:
  lore sources
  lore sources | jq '.[0]'
  lore sources | jq -r '.[] | "\\(.source): \\(.count)"'
`);
  process.exit(0);
}

// ============================================================================
// Capture Command
// ============================================================================

async function handleCaptureTask(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  const required = ["topic", "name", "problem", "solution"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: TaskInput = {
    topic: parsed.get("topic")!,
    name: parsed.get("name")!,
    problem: parsed.get("problem")!,
    solution: parsed.get("solution")!,
    code: parsed.get("code"),
    discoveries: parseList(parsed.get("discoveries")),
    deviations: parsed.get("deviations"),
    pattern: parsed.get("pattern"),
    tags: parseList(parsed.get("tags")),
    tech: parseList(parsed.get("tech")),
    difficulty: parsed.get("difficulty"),
  };

  const result = captureTask(input);

  if (result.success && result.event) {
    try {
      await indexAndEmbed([result.event]);
      output(result);
      console.error("✅ Task logged and indexed");
      process.exit(0);
    } catch (error) {
      output(result);
      console.error(`✅ Task logged (indexing failed: ${error})`);
      process.exit(0);
    }
  } else {
    output(result);
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

async function handleCaptureKnowledge(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  const required = ["topic", "text", "subtype"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: KnowledgeInput = {
    topic: parsed.get("topic")!,
    content: parsed.get("text")!,
    subtype: parsed.get("subtype")! as KnowledgeCaptureType,
  };

  const result = captureKnowledge(input);

  if (result.success && result.event) {
    try {
      await indexAndEmbed([result.event]);
      output(result);
      console.error("✅ Knowledge logged and indexed");
      process.exit(0);
    } catch (error) {
      output(result);
      console.error(`✅ Knowledge logged (indexing failed: ${error})`);
      process.exit(0);
    }
  } else {
    output(result);
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }
}

async function handleCaptureNote(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (!parsed.has("text")) {
    fail("Missing required field: text");
  }

  const input: NoteInput = {
    content: parsed.get("text")!,
    tags: parseList(parsed.get("tags")),
    topic: parsed.get("topic"),
  };

  const result = captureNote(input);

  if (result.success && result.event) {
    try {
      await indexAndEmbed([result.event]);
      output(result);
      console.error("✅ Note logged and indexed");
      process.exit(0);
    } catch (error) {
      output(result);
      console.error(`✅ Note logged (indexing failed: ${error})`);
      process.exit(0);
    }
  } else {
    output(result);
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

async function handleCaptureTeaching(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  const required = ["topic", "confidence", "text"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: TeachingInput = {
    topic: parsed.get("topic")!,
    confidence: parsed.get("confidence")!,
    content: parsed.get("text")!,
    source: parsed.get("source"),
  };

  const result = captureTeaching(input);

  if (result.success && result.event) {
    try {
      await indexAndEmbed([result.event]);
      output(result);
      console.error("✅ Teaching logged and indexed");
      process.exit(0);
    } catch (error) {
      output(result);
      console.error(`✅ Teaching logged (indexing failed: ${error})`);
      process.exit(0);
    }
  } else {
    output(result);
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

async function handleCaptureObservation(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  const required = ["topic", "subtype", "confidence", "text"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: ObservationInput = {
    topic: parsed.get("topic")!,
    content: parsed.get("text")!,
    subtype: parsed.get("subtype")! as ObservationSubtype,
    confidence: parsed.get("confidence")! as ObservationConfidence,
    source: parsed.get("source"),
  };

  const result = captureObservation(input);

  if (result.success && result.event) {
    try {
      await indexAndEmbed([result.event]);
      output(result);
      console.error("✅ Observation logged and indexed");
      process.exit(0);
    } catch (error) {
      output(result);
      console.error(`✅ Observation logged (indexing failed: ${error})`);
      process.exit(0);
    }
  } else {
    output(result);
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

async function handleCapture(args: string[]): Promise<void> {
  if (hasFlag(args, "help")) {
    showCaptureHelp();
  }

  if (args.length === 0) {
    fail(
      "Missing capture type. Use: task, knowledge, note, teaching, or observation",
    );
  }

  const captureType = args[0];
  const captureArgs = args.slice(1);

  switch (captureType) {
    case "task":
      await handleCaptureTask(captureArgs);
      break;
    case "knowledge":
      await handleCaptureKnowledge(captureArgs);
      break;
    case "note":
      await handleCaptureNote(captureArgs);
      break;
    case "teaching":
      await handleCaptureTeaching(captureArgs);
      break;
    case "observation":
      await handleCaptureObservation(captureArgs);
      break;
    default:
      fail(
        `Unknown capture type: ${captureType}. Use: task, knowledge, note, teaching, or observation`,
      );
  }
}

// ============================================================================
// Help & Main
// ============================================================================

function showHelp(): void {
  console.log(`
lore - Unified knowledge CLI

Philosophy:
  Single entry point for your knowledge fabric.
  Search, list, and capture indexed knowledge.
  JSON output for composability with jq, grep, etc.

Usage:
  lore search <query>                   Search all sources
  lore search <source> <query>          Search specific source
  lore sources                          List indexed sources with counts
  lore list <source>                    List source entries
  lore info                             Show indexed sources and counts
  lore info --human                     Human-readable info
  lore about <project>                  Aggregate view of project knowledge
  lore about <project> --brief          Compact project summary
  lore capture task|knowledge|note|teaching  Capture knowledge

Search Options:
  --exact           Use FTS5 text search (bypasses semantic search)
  --type <types>    Filter by knowledge type (gotcha, decision, learning, etc.)
  --limit <n>       Maximum results (default: 20)
  --project <name>  Filter results by project
  --brief           Compact output (titles only)
  --since <date>    Filter by date (today, yesterday, this-week, YYYY-MM-DD)

Passthrough Sources:
  prismis           Semantic search via prismis daemon (requires prismis-daemon running)
  atuin             Shell history search (queries ~/.local/share/atuin/history.db directly)

List Options:
  --limit <n>       Maximum entries
  --format <fmt>    Output format: json (default), jsonl, human
  --brief           Compact output (titles only)
  --project <name>  Filter by project name

Capture Types:
  task              Log task completion
    --topic         Project/topic name (required)
    --name          Task name (required)
    --problem       Problem solved (required)
    --solution      Solution pattern (required)

  knowledge         Log insight
    --topic         Topic/context name (required)
    --text          Insight text (required)
    --subtype       Type: decision, learning, gotcha, preference (required)

  note              Quick note
    --text          Note content (required)
    --tags          Comma-separated tags
    --topic         Optional topic/context

  teaching          Log teaching/learning
    --topic         Subject area (required)
    --confidence    Certainty level (required)
    --text          Teaching content (required)
    --source        Optional source identifier

  observation       Log model observation
    --topic         Observation topic (required)
    --subtype       Type: term, style, pattern, preference, context (required)
    --confidence    Level: inferred, stated, verified (required)
    --text          Observation content (required)
    --source        Optional source identifier

Examples:
  lore search "authentication"
  lore search --type=gotcha "sable"
  lore search --type=gotcha,decision "lore"
  lore search blogs "typescript patterns"
  lore sources
  lore list development
  lore list commits --limit 10 --format human
  lore capture knowledge --topic=lore --text="Unified CLI works" --subtype=learning
  lore capture observation --topic=vocabulary --subtype=term --confidence=stated --text="Uses unified schema"
`);
  process.exit(0);
}

function showSearchHelp(): void {
  console.log(`
lore search - Search indexed knowledge

Usage:
  lore search <query>                   Search all sources (hybrid by default)
  lore search <source> <query>          Search specific source

Search Modes:
  (default)         Hybrid search (vector + keyword merged, 0.7/0.3 weighting)
  --exact           FTS5 keyword search only
  --semantic        Vector search only

Options:
  --type <types>    Filter by knowledge type (pre-filters before search)
                    Comma-separated: --type=gotcha,decision
                    Valid: gotcha, decision, pattern, learning, preference,
                           term, style, teaching, task, todo, idea
  --limit <n>       Maximum results (default: 20)
  --project <name>  Filter results by project/topic
  --brief           Compact output (titles only)
  --since <date>    Filter by date (today, yesterday, this-week, YYYY-MM-DD)
  --help            Show this help

Indexed Sources:
  blogs             Blog posts and articles
  captures          Quick captures and notes
  commits           Git commit history
  development       Active development projects
  events            Calendar events and meetings
  explorations      Technical explorations
  obsidian          Obsidian vault notes
  personal          Personal data (books, movies, etc.)
  readmes           Project README files
  sessions          Claude Code session transcripts
  tasks             Logged development tasks
  teachings         Teaching moments

Passthrough Sources:
  prismis           Semantic search via prismis daemon
                    (requires prismis-daemon running)
  atuin             Shell history search
                    (queries ~/.local/share/atuin/history.db directly)

See also:
  lore sources      List all sources with entry counts

Examples:
  lore search "authentication"                      # hybrid (default)
  lore search --type=gotcha "sable"                 # filter by type
  lore search --type=gotcha,decision "lore"         # multiple types
  lore search --exact "def process_data"            # keyword only
  lore search --semantic "login flow concepts"      # vector only
  lore search blogs "typescript patterns"
  lore search commits --since this-week "refactor"
  lore search "authentication" --project=momentum --limit 5
  lore search prismis "kubernetes security"
  lore search atuin "docker build"
`);
  process.exit(0);
}

function showListHelp(): void {
  console.log(`
lore list - List source entries

Usage:
  lore list <source>                    List entries in source

Options:
  --limit <n>       Maximum entries (default: all)
  --format <fmt>    Output format: json (default), jsonl, human
  --project <name>  Filter by project name
  --type <type>     Filter captures by type (learning, gotcha, preference, decision)
  --brief           Compact output (titles only)
  --help            Show this help

Available Sources:
  blogs             Blog posts
  books             Books read
  captures          Quick captures
  commits           Git commits
  development       Development projects
  events            Calendar events
  explorations      Technical explorations
  habits            Tracked habits
  interests         Personal interests
  movies            Movies watched
  obsidian          Obsidian notes
  people            People/contacts
  podcasts          Podcasts listened
  readmes           Project READMEs
  sessions          Claude Code sessions
  tasks             Development tasks
  teachings         Teaching moments

See also:
  lore sources      List all sources with entry counts

Examples:
  lore list development
  lore list commits --limit 10 --format human
  lore list commits --project=momentum --limit 5
  lore list captures --type=learning --limit 5
  lore list books --format jsonl
`);
  process.exit(0);
}

function showInfoHelp(): void {
  console.log(`
lore info - Show indexed sources and counts

Usage:
  lore info                             Show all sources and counts
  lore info --human                     Human-readable format

Options:
  --human           Human-readable format (default: JSON)
  --help            Show this help

Output Fields:
  sources           Array of {name, count} for each indexed source
  projects          Known projects across all sources
  last_indexed      Most recent timestamp from indexed data
  total_entries     Total number of indexed entries

Examples:
  lore info
  lore info | jq '.sources | length'
  lore info --human
`);
  process.exit(0);
}

function showProjectsHelp(): void {
  console.log(`
lore projects - List all known projects

Usage:
  lore projects                         List all unique project names

Options:
  --help            Show this help

Output:
  JSON array of project names, sorted alphabetically.
  Projects are extracted from metadata fields across all sources.

Sources checked:
  commits           project field
  sessions          project field
  tasks             project field
  captures          context field
  teachings         source field

Examples:
  lore projects
  lore projects | jq -r '.projects[]'
  lore projects | jq '.projects | length'
`);
  process.exit(0);
}

function showAboutHelp(): void {
  console.log(`
lore about - Show everything about a project

Usage:
  lore about <project>                  Aggregate view of project knowledge
  lore about <project> --brief          Compact output

Options:
  --brief           Compact output (titles only)
  --limit <n>       Results per source (default: 10)
  --help            Show this help

Sources queried:
  commits           Git commits for project
  captures          Quick captures in project context
  flux              Flux items for project
  teachings         Teachings from project
  sessions          Claude Code sessions for project

Output (JSON):
  {
    "project": "name",
    "commits": [...],
    "captures": [...],
    "flux": [...],
    "teachings": [...],
    "sessions": [...]
  }

Output (--brief):
  commits (3):
    project: hash - commit message

  captures (2):
    project: insight text

Examples:
  lore about momentum --brief
  lore about lore | jq '.commits | length'
  lore about momentum --limit 5
`);
  process.exit(0);
}

function showCaptureHelp(): void {
  console.log(`
lore capture - Capture knowledge

Usage:
  lore capture task                     Log task completion
  lore capture knowledge                Log insight/learning
  lore capture note                     Quick note
  lore capture teaching                 Log teaching moment
  lore capture observation              Log model observation

Capture Types:

  task - Log completed development task
    Required:
      --topic         Project/topic name
      --name          Task name
      --problem       Problem solved
      --solution      Solution pattern
    Optional:
      --code          Code snippet
      --discoveries   Comma-separated discoveries
      --deviations    Deviation from plan
      --pattern       Pattern name
      --tags          Comma-separated tags
      --tech          Comma-separated technologies
      --difficulty    Difficulty level

  knowledge - Log insight or learning
    Required:
      --topic         Topic/context name
      --text          Insight text
      --subtype       Type: decision, learning, gotcha, preference, project, conversation, knowledge

  note - Quick note capture
    Required:
      --text          Note content
    Optional:
      --tags          Comma-separated tags
      --topic         Optional topic/context

  teaching - Log teaching or learning moment
    Required:
      --topic         Subject area (e.g., typescript, architecture)
      --confidence    Certainty level (e.g., high, medium, low)
      --text          Teaching content
    Optional:
      --source        Source identifier (defaults to "manual")

  observation - Log model observation about user patterns
    Required:
      --topic         Observation topic
      --subtype       Type: term, style, pattern, preference, context
      --confidence    Level: inferred, stated, verified
      --text          Observation content
    Optional:
      --source        Source identifier (defaults to "auto")

Examples:
  lore capture task --topic=lore --name="Add help" --problem="No subcommand help" --solution="Added per-command help functions"
  lore capture knowledge --topic=lore --text="Unified CLI works" --subtype=learning
  lore capture note --text="Remember to update docs" --tags=docs,todo
  lore capture teaching --topic=patterns --confidence=high --text="Prefer composition over inheritance"
  lore capture observation --topic=vocabulary --subtype=term --confidence=stated --text="Uses 'unified schema'"
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show global help only when no args or help is first arg
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case "search":
      await handleSearch(commandArgs);
      break;
    case "list":
      handleList(commandArgs);
      break;
    case "sources":
      handleSources(commandArgs);
      break;
    case "info":
      handleInfo(commandArgs);
      break;
    case "projects":
      handleProjects(commandArgs);
      break;
    case "about":
      handleAbout(commandArgs);
      break;
    case "capture":
      await handleCapture(commandArgs);
      break;
    default:
      fail(
        `Unknown command: ${command}. Use: search, list, sources, info, projects, about, or capture`,
      );
  }
}

main();
