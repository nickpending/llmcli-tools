#!/usr/bin/env bun
/**
 * sable-eval CLI - Thin wrapper around scoreArtifact()
 *
 * Usage:
 *   sable-eval --rubric <name-or-path> --artifact <path> [options]
 *
 * Output: JSON to stdout, diagnostics to stderr
 * Exit codes: 0 = pass, 1 = fail (scored below threshold), 2 = error
 */

import { scoreArtifact } from "./index";

interface ParsedArgs {
  rubric?: string;
  artifact?: string;
  maxTokens?: number;
  threshold?: number;
}

function printUsage(): void {
  process.stderr.write(`sable-eval - Rubric-based artifact scoring tool

Usage:
  sable-eval --rubric <name-or-path> --artifact <path> [options]

Options:
  --rubric NAME-OR-PATH    Rubric name (task-plan-quality) or path to YAML
  --artifact PATH          Path to artifact file to score
  --max-tokens NUM         Max output tokens (default: 2048)
  --threshold NUM          Pass threshold override (0-1, default: from rubric)

Model configured via sable-eval service in ~/.config/llm-core/services.toml

Output: JSON to stdout
Exit codes: 0 = pass, 1 = fail (scored below threshold), 2 = error

Examples:
  sable-eval --rubric task-plan-quality --artifact /path/to/plan.md
  sable-eval --rubric ./custom-rubric.yaml --artifact report.md --threshold 0.9
`);
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const args = argv.slice(2);
  const parsed: ParsedArgs = {};

  if (args.length === 0) {
    return null;
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--rubric") {
      parsed.rubric = args[++i];
    } else if (arg === "--artifact") {
      parsed.artifact = args[++i];
    } else if (arg === "--max-tokens") {
      parsed.maxTokens = parseInt(args[++i], 10);
    } else if (arg === "--threshold") {
      parsed.threshold = parseFloat(args[++i]);
    } else if (arg === "--help" || arg === "-h") {
      return null;
    }
  }

  return parsed;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed) {
    printUsage();
    process.exit(0);
  }

  if (!parsed.rubric) {
    process.stderr.write("Error: --rubric is required\n\n");
    printUsage();
    process.exit(2);
  }

  if (!parsed.artifact) {
    process.stderr.write("Error: --artifact is required\n\n");
    printUsage();
    process.exit(2);
  }

  try {
    const result = await scoreArtifact(parsed.rubric, parsed.artifact, {
      maxTokens: parsed.maxTokens,
    });

    // Apply threshold override if provided (error always forces fail)
    if (typeof parsed.threshold === "number") {
      result.threshold = parsed.threshold;
      result.passed = !result.error && result.score >= parsed.threshold;
    }

    // JSON to stdout
    console.log(JSON.stringify(result, null, 2));

    // Exit code: 0 = pass, 1 = fail, 2 = error
    if (result.error) {
      process.exit(2);
    }
    process.exit(result.passed ? 0 : 1);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ error }, null, 2));
    process.stderr.write(`Error: ${error}\n`);
    process.exit(2);
  }
}

main();
