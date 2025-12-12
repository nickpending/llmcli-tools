#!/usr/bin/env bun
/**
 * lore-search CLI
 *
 * Philosophy:
 * - Fast - SQLite FTS5 for sub-second queries
 * - Composable - JSON output pipes to jq, grep, etc.
 * - Simple - Manual arg parsing, zero framework dependencies
 *
 * Usage:
 *   lore-search <query>                    # Search all sources
 *   lore-search <source> <query>           # Search specific source
 *   lore-search --sources                  # List available sources
 *
 * Exit codes:
 *   0 - Success
 *   1 - Failure (validation)
 *   2 - Error (database)
 */

import { search, listSources, type SearchResult } from "./index";

/**
 * Parse relative or absolute date to YYYY-MM-DD format
 */
function parseSinceDate(value: string): string | null {
  const today = new Date();

  if (value === "today") {
    return today.toISOString().split("T")[0];
  }

  if (value === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  }

  if (value === "this-week") {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return weekAgo.toISOString().split("T")[0];
  }

  // Validate YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return value;
    }
  }

  return null;
}

interface SearchOutput {
  success: boolean;
  results?: SearchResult[];
  sources?: { source: string; count: number }[];
  count?: number;
  error?: string;
}

function printUsage(): void {
  console.error(`
lore-search - Knowledge search CLI

Philosophy:
  Query your indexed knowledge fabric via FTS5 full-text search.
  JSON output by default for composability with jq, grep, etc.

Usage:
  lore-search <query>                    Search all sources
  lore-search <source> <query>           Search specific source
  lore-search --sources                  List indexed sources

Options:
  --limit <n>     Maximum results (default: 20)
  --since <date>  Filter by date (today, yesterday, this-week, YYYY-MM-DD)
  --sources       List indexed sources with counts
  --help, -h      Show this help

Examples:
  lore-search "authentication"           Find auth-related content
  lore-search blogs "typescript"         Search only blogs
  lore-search --sources                  List all indexed sources
  lore-search "error" | jq '.results[]'  Pipe results to jq

FTS5 Query Syntax:
  word            Match word anywhere
  "exact phrase"  Match exact phrase
  word1 word2     Match both (implicit AND)
  word1 OR word2  Match either
  word*           Prefix match

Available Domains:
  blogs           Blog posts from labs.voidwire.info
  captures        Quick captures and notes
  commits         Git commit messages across projects
  development     Development project READMEs and docs
  events          Calendar events and meetings
  explorations    Technical exploration documents
  obsidian        Obsidian vault notes
  personal        Personal data (books, movies, podcasts, interests)
  readmes         Project README files
  sessions        Claude Code session logs
  tasks           Project task definitions
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Parse options
  let limit = 20;
  let since: string | undefined;
  let showSources = false;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--since") {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        const output: SearchOutput = {
          success: false,
          error:
            "--since requires a date (today, yesterday, this-week, YYYY-MM-DD)",
        };
        console.log(JSON.stringify(output));
        console.error(
          "❌ --since requires a date (today, yesterday, this-week, YYYY-MM-DD)",
        );
        process.exit(1);
      }
      const parsed = parseSinceDate(nextArg);
      if (!parsed) {
        const output: SearchOutput = {
          success: false,
          error: `Invalid date: ${nextArg}. Use: today, yesterday, this-week, or YYYY-MM-DD`,
        };
        console.log(JSON.stringify(output));
        console.error(
          `❌ Invalid date: ${nextArg}. Use: today, yesterday, this-week, or YYYY-MM-DD`,
        );
        process.exit(1);
      }
      since = parsed;
      i++;
    } else if (arg === "--limit") {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        const output: SearchOutput = {
          success: false,
          error: "--limit requires a number",
        };
        console.log(JSON.stringify(output));
        console.error("❌ --limit requires a number");
        process.exit(1);
      }
      limit = parseInt(nextArg, 10);
      if (isNaN(limit) || limit < 1) {
        const output: SearchOutput = {
          success: false,
          error: "--limit must be a positive number",
        };
        console.log(JSON.stringify(output));
        console.error("❌ --limit must be a positive number");
        process.exit(1);
      }
      i++;
    } else if (arg === "--sources") {
      showSources = true;
    } else if (!arg.startsWith("--")) {
      positionalArgs.push(arg);
    }
  }

  try {
    // Handle --sources
    if (showSources) {
      const sources = listSources();
      const output: SearchOutput = { success: true, sources };
      console.log(JSON.stringify(output, null, 2));
      console.error(`✅ ${sources.length} sources indexed`);
      process.exit(0);
    }

    // Determine source and query from positional args
    let source: string | undefined;
    let query: string;

    if (positionalArgs.length === 0) {
      const output: SearchOutput = {
        success: false,
        error: "Missing search query",
      };
      console.log(JSON.stringify(output));
      console.error("❌ Missing search query. Use: lore-search <query>");
      process.exit(1);
    } else if (positionalArgs.length === 1) {
      query = positionalArgs[0];
    } else {
      source = positionalArgs[0];
      query = positionalArgs.slice(1).join(" ");
    }

    // Execute search
    const results = search(query, { source, limit, since });

    // Output JSON to stdout
    const output: SearchOutput = {
      success: true,
      results,
      count: results.length,
    };
    console.log(JSON.stringify(output, null, 2));

    // Diagnostic to stderr
    console.error(
      `✅ ${results.length} result${results.length !== 1 ? "s" : ""} found`,
    );
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const output: SearchOutput = { success: false, error: message };
    console.log(JSON.stringify(output));
    console.error(`❌ ${message}`);
    process.exit(2);
  }
}

main();
