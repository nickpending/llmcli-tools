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
 *   lore list <domain>                    List domain entries
 *   lore capture task|knowledge|note      Capture knowledge
 *
 * Exit codes:
 *   0 - Success
 *   1 - Validation error
 *   2 - Runtime error
 */

import {
  search,
  searchPrismis,
  listSources,
  list,
  listDomains,
  captureTask,
  captureKnowledge,
  captureNote,
  DOMAINS,
  type SearchResult,
  type ListResult,
  type ListEntry,
  type Domain,
  type TaskInput,
  type KnowledgeInput,
  type NoteInput,
  type KnowledgeCaptureType,
} from "./index";

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

function getPositionalArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("--"));
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

function handleSearch(args: string[]): void {
  if (hasFlag(args, "help")) {
    showSearchHelp();
  }

  const parsed = parseArgs(args);
  const positional = getPositionalArgs(args);

  // Handle --sources flag
  if (hasFlag(args, "sources")) {
    const sources = listSources();
    output({ success: true, sources });
    console.error(`✅ ${sources.length} sources indexed`);
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

  try {
    const results = search(query, { source, limit, since });
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
}

// ============================================================================
// List Command
// ============================================================================

function formatHumanOutput(result: ListResult): string {
  const lines: string[] = [`${result.domain} (${result.count} entries):`, ""];

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

  // Handle --domains flag
  if (hasFlag(args, "domains")) {
    output({ success: true, domains: listDomains() });
    console.error(`✅ ${DOMAINS.length} domains available`);
    process.exit(0);
  }

  if (positional.length === 0) {
    fail(`Missing domain. Available: ${DOMAINS.join(", ")}`);
  }

  const domain = positional[0] as Domain;

  if (!DOMAINS.includes(domain)) {
    fail(`Invalid domain: ${domain}. Available: ${DOMAINS.join(", ")}`);
  }

  const limit = parsed.has("limit")
    ? parseInt(parsed.get("limit")!, 10)
    : undefined;
  const format = parsed.get("format") || "json";

  try {
    const result = list(domain, { limit });

    if (format === "human") {
      console.log(formatHumanOutput(result));
    } else if (format === "jsonl") {
      for (const entry of result.entries) {
        console.log(JSON.stringify(entry));
      }
    } else {
      output({
        success: true,
        domain: result.domain,
        entries: result.entries,
        count: result.count,
      });
    }

    console.error(`✅ ${result.count} entries in ${domain}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    fail(message, 2);
  }
}

// ============================================================================
// Capture Command
// ============================================================================

function handleCaptureTask(args: string[]): void {
  const parsed = parseArgs(args);

  const required = ["project", "name", "problem", "solution"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: TaskInput = {
    project: parsed.get("project")!,
    name: parsed.get("name")!,
    problem: parsed.get("problem")!,
    solution: parsed.get("solution")!,
    code: parsed.get("code"),
    discoveries: parseList(parsed.get("discoveries")),
    deviations: parsed.get("deviations"),
    pattern: parsed.get("pattern"),
    keywords: parseList(parsed.get("keywords")),
    tech: parseList(parsed.get("tech")),
    difficulty: parsed.get("difficulty"),
  };

  const result = captureTask(input);
  output(result);

  if (result.success) {
    console.error("✅ Task logged");
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

function handleCaptureKnowledge(args: string[]): void {
  const parsed = parseArgs(args);

  const required = ["context", "text", "type"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: KnowledgeInput = {
    context: parsed.get("context")!,
    text: parsed.get("text")!,
    type: parsed.get("type")! as KnowledgeCaptureType,
  };

  const result = captureKnowledge(input);
  output(result);

  if (result.success) {
    console.error("✅ Knowledge logged");
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }
}

function handleCaptureNote(args: string[]): void {
  const parsed = parseArgs(args);

  if (!parsed.has("text")) {
    fail("Missing required field: text");
  }

  const input: NoteInput = {
    text: parsed.get("text")!,
    tags: parseList(parsed.get("tags")),
    context: parsed.get("context"),
  };

  const result = captureNote(input);
  output(result);

  if (result.success) {
    console.error("✅ Note logged");
    process.exit(0);
  } else {
    console.error(`❌ ${result.error}`);
    process.exit(2);
  }
}

function handleCapture(args: string[]): void {
  if (hasFlag(args, "help")) {
    showCaptureHelp();
  }

  if (args.length === 0) {
    fail("Missing capture type. Use: task, knowledge, or note");
  }

  const captureType = args[0];
  const captureArgs = args.slice(1);

  switch (captureType) {
    case "task":
      handleCaptureTask(captureArgs);
      break;
    case "knowledge":
      handleCaptureKnowledge(captureArgs);
      break;
    case "note":
      handleCaptureNote(captureArgs);
      break;
    default:
      fail(
        `Unknown capture type: ${captureType}. Use: task, knowledge, or note`,
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
  lore search --sources                 List indexed sources
  lore list <domain>                    List domain entries
  lore list --domains                   List available domains
  lore capture task|knowledge|note      Capture knowledge

Search Options:
  --limit <n>       Maximum results (default: 20)
  --since <date>    Filter by date (today, yesterday, this-week, YYYY-MM-DD)
  --sources         List indexed sources with counts

Passthrough Sources:
  prismis           Semantic search via prismis daemon (requires prismis-daemon running)

List Options:
  --limit <n>       Maximum entries
  --format <fmt>    Output format: json (default), jsonl, human
  --domains         List available domains

Capture Types:
  task              Log task completion
    --project       Project name (required)
    --name          Task name (required)
    --problem       Problem solved (required)
    --solution      Solution pattern (required)

  knowledge         Log insight
    --context       Context/project name (required)
    --text          Insight text (required)
    --type          Type: decision, learning, gotcha, preference (required)

  note              Quick note
    --text          Note content (required)
    --tags          Comma-separated tags
    --context       Optional context

Examples:
  lore search "authentication"
  lore search blogs "typescript patterns"
  lore list development
  lore list commits --limit 10 --format human
  lore capture knowledge --context=lore --text="Unified CLI works" --type=learning
`);
  process.exit(0);
}

function showSearchHelp(): void {
  console.log(`
lore search - Search indexed knowledge

Usage:
  lore search <query>                   Search all sources
  lore search <source> <query>          Search specific source
  lore search --sources                 List indexed sources

Options:
  --limit <n>       Maximum results (default: 20)
  --since <date>    Filter by date (today, yesterday, this-week, YYYY-MM-DD)
  --sources         List indexed sources with counts
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

Passthrough Sources:
  prismis           Semantic search via prismis daemon
                    (requires prismis-daemon running)

Examples:
  lore search "authentication"
  lore search blogs "typescript patterns"
  lore search commits --since this-week "refactor"
  lore search prismis "kubernetes security"
`);
  process.exit(0);
}

function showListHelp(): void {
  console.log(`
lore list - List domain entries

Usage:
  lore list <domain>                    List entries in domain
  lore list --domains                   List available domains

Options:
  --limit <n>       Maximum entries (default: all)
  --format <fmt>    Output format: json (default), jsonl, human
  --domains         List available domains
  --help            Show this help

Available Domains:
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
  personal          Personal data aggregate
  podcasts          Podcasts listened
  readmes           Project READMEs
  sessions          Claude Code sessions
  tasks             Development tasks

Examples:
  lore list development
  lore list commits --limit 10 --format human
  lore list books --format jsonl
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

Capture Types:

  task - Log completed development task
    Required:
      --project       Project name
      --name          Task name
      --problem       Problem solved
      --solution      Solution pattern
    Optional:
      --code          Code snippet
      --discoveries   Comma-separated discoveries
      --deviations    Deviation from plan
      --pattern       Pattern name
      --keywords      Comma-separated keywords
      --tech          Comma-separated technologies
      --difficulty    Difficulty level

  knowledge - Log insight or learning
    Required:
      --context       Context/project name
      --text          Insight text
      --type          Type: decision, learning, gotcha, preference

  note - Quick note capture
    Required:
      --text          Note content
    Optional:
      --tags          Comma-separated tags
      --context       Optional context

Examples:
  lore capture task --project=lore --name="Add help" --problem="No subcommand help" --solution="Added per-command help functions"
  lore capture knowledge --context=lore --text="Unified CLI works" --type=learning
  lore capture note --text="Remember to update docs" --tags=docs,todo
`);
  process.exit(0);
}

function main(): void {
  const args = process.argv.slice(2);

  // Show global help only when no args or help is first arg
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case "search":
      handleSearch(commandArgs);
      break;
    case "list":
      handleList(commandArgs);
      break;
    case "capture":
      handleCapture(commandArgs);
      break;
    default:
      fail(`Unknown command: ${command}. Use: search, list, or capture`);
  }
}

main();
