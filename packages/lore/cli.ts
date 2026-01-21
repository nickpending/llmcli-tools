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
  listDomains,
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
  semanticSearch,
  formatBriefSearch,
  hasEmbeddings,
  DOMAINS,
  type SearchResult,
  type ListResult,
  type ListEntry,
  type Domain,
  type TaskInput,
  type KnowledgeInput,
  type NoteInput,
  type TeachingInput,
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

// Boolean flags that don't take values
const BOOLEAN_FLAGS = new Set(["help", "sources", "domains", "exact", "brief"]);

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
      const results = search(query, { source, limit, since });
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

  // Semantic path (default) - fail if unavailable
  if (!hasEmbeddings()) {
    fail("No embeddings found. Run lore-embed-all first.", 2);
  }

  const brief = hasFlag(args, "brief");

  try {
    const results = await semanticSearch(query, { source, limit, project });

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
  const project = parsed.get("project");
  const brief = hasFlag(args, "brief");

  try {
    const result = list(domain, { limit, project });

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
      result.tasks.count +
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

function handleCaptureTeaching(args: string[]): void {
  const parsed = parseArgs(args);

  const required = ["domain", "confidence", "text"];
  const missing = required.filter((f) => !parsed.has(f));
  if (missing.length > 0) {
    fail(`Missing required fields: ${missing.join(", ")}`);
  }

  const input: TeachingInput = {
    domain: parsed.get("domain")!,
    confidence: parsed.get("confidence")!,
    text: parsed.get("text")!,
    source: parsed.get("source"),
  };

  const result = captureTeaching(input);
  output(result);

  if (result.success) {
    console.error("✅ Teaching logged");
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
    case "teaching":
      handleCaptureTeaching(captureArgs);
      break;
    default:
      fail(
        `Unknown capture type: ${captureType}. Use: task, knowledge, note, or teaching`,
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
  lore info                             Show indexed sources and counts
  lore info --human                     Human-readable info
  lore about <project>                  Aggregate view of project knowledge
  lore about <project> --brief          Compact project summary
  lore capture task|knowledge|note|teaching  Capture knowledge

Search Options:
  --exact           Use FTS5 text search (bypasses semantic search)
  --limit <n>       Maximum results (default: 20)
  --project <name>  Filter results by project
  --brief           Compact output (titles only)
  --since <date>    Filter by date (today, yesterday, this-week, YYYY-MM-DD)
  --sources         List indexed sources with counts

Passthrough Sources:
  prismis           Semantic search via prismis daemon (requires prismis-daemon running)
  atuin             Shell history search (queries ~/.local/share/atuin/history.db directly)

List Options:
  --limit <n>       Maximum entries
  --format <fmt>    Output format: json (default), jsonl, human
  --brief           Compact output (titles only)
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

  teaching          Log teaching/learning
    --domain        Subject area (required)
    --confidence    Certainty level (required)
    --text          Teaching content (required)
    --source        Optional source identifier

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
  --exact           Use FTS5 text search (bypasses semantic search)
  --limit <n>       Maximum results (default: 20)
  --project <name>  Filter results by project (post-filters KNN results)
  --brief           Compact output (titles only)
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
  atuin             Shell history search
                    (queries ~/.local/share/atuin/history.db directly)

Examples:
  lore search "authentication"
  lore search blogs "typescript patterns"
  lore search commits --since this-week "refactor"
  lore search "authentication" --project=momentum --limit 5
  lore search --exact "def process_data"
  lore search prismis "kubernetes security"
  lore search atuin "docker build"
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
  --project <name>  Filter by project name
  --brief           Compact output (titles only)
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
  lore list commits --project=momentum --limit 5
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
  tasks             Development tasks for project
  teachings         Teachings from project
  sessions          Claude Code sessions for project

Output (JSON):
  {
    "project": "name",
    "commits": [...],
    "captures": [...],
    "tasks": [...],
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

  teaching - Log teaching or learning moment
    Required:
      --domain        Subject area (e.g., typescript, architecture)
      --confidence    Certainty level (e.g., high, medium, low)
      --text          Teaching content
    Optional:
      --source        Source identifier (defaults to "manual")

Examples:
  lore capture task --project=lore --name="Add help" --problem="No subcommand help" --solution="Added per-command help functions"
  lore capture knowledge --context=lore --text="Unified CLI works" --type=learning
  lore capture note --text="Remember to update docs" --tags=docs,todo
  lore capture teaching --domain=patterns --confidence=high --text="Prefer composition over inheritance"
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
      handleCapture(commandArgs);
      break;
    default:
      fail(
        `Unknown command: ${command}. Use: search, list, info, projects, about, or capture`,
      );
  }
}

main();
