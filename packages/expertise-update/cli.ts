#!/usr/bin/env bun
/**
 * expertise-update CLI
 *
 * Sync Lore insights into PROJECT_EXPERTISE.toml [insights] section.
 *
 * Usage:
 *   expertise-update --project <name> --root <path>
 *
 * Exit codes:
 *   0 - Success (including no updates needed)
 *   1 - Failure (validation, missing args)
 *   2 - Error (runtime)
 */

import { updateExpertise, type ExpertiseResult } from "./index";

function printUsage(): void {
  console.error(`
expertise-update - Sync Lore insights into PROJECT_EXPERTISE.toml

Usage:
  expertise-update --project <name> --root <path>

Arguments:
  --project, -p   Project name for Lore queries (required)
  --root, -r      Project root directory path (required)
  --help, -h      Show this help

Examples:
  expertise-update --project argus --root ~/development/projects/argus
  expertise-update -p momentum -r ~/development/projects/momentum

Behavior:
  1. Queries Lore for project-specific captures (gotchas, decisions, learnings)
  2. Reads existing .workflow/artifacts/PROJECT_EXPERTISE.toml
  3. Merges into [insights] section (additive, no duplicates)
  4. Writes updated TOML

Output (JSON to stdout):
  {"updated": true, "insights_added": 5, "total_insights": 12}

Constraints:
  - Silent on missing expertise file (exit 0, nothing to update)
  - Deduplicates insights by content
  - Preserves existing insights (additive only)
`);
}

interface CliArgs {
  project?: string;
  root?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = { help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--project" || arg === "-p") {
      result.project = args[++i];
    } else if (arg === "--root" || arg === "-r") {
      result.root = args[++i];
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.project) {
    console.log(
      JSON.stringify({ error: "Missing required argument: --project" }),
    );
    console.error("Missing required argument: --project");
    process.exit(1);
  }

  if (!args.root) {
    console.log(JSON.stringify({ error: "Missing required argument: --root" }));
    console.error("Missing required argument: --root");
    process.exit(1);
  }

  try {
    const result = await updateExpertise(args.project, args.root);

    // Output JSON to stdout
    console.log(JSON.stringify(result));

    // Diagnostic to stderr
    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(2);
    }

    if (result.updated) {
      console.error(
        `Updated: +${result.insights_added} insights (${result.total_insights} total)`,
      );
    } else if (result.total_insights > 0) {
      console.error(`No new insights (${result.total_insights} total)`);
    } else {
      console.error("No expertise file found");
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(JSON.stringify({ error: message }));
    console.error(`Error: ${message}`);
    process.exit(2);
  }
}

main();
