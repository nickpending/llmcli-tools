#!/usr/bin/env bun
/**
 * language-detect CLI
 *
 * Philosophy:
 * - Evidence-based detection - Shows WHY each language was detected
 * - Fast scanning - Only checks markers, not full file enumeration
 * - Composable output - JSON pipes to jq, other tools
 *
 * Usage:
 *   language-detect <project-dir>
 *
 * Exit codes:
 *   0 - Success (languages detected or none found)
 *   2 - Error (invalid args, directory not found)
 */

import { existsSync } from "fs";
import { detectLanguages } from "./index";

/**
 * Print usage and exit
 */
function printUsage(): void {
  console.error(`
language-detect - Project Language Detector

Usage: language-detect <project-dir>

Arguments:
  project-dir  Path to project root

Exit codes:
  0 - Success
  2 - Error

Examples:
  # Detect languages in current directory
  language-detect .

  # Detect in specific project
  language-detect /path/to/project

  # List detected languages
  language-detect . | jq -r '.languages[]'

  # Show evidence for Python detection
  language-detect . | jq '.markers.python'

  # Check if project uses Go
  language-detect . | jq -e '.languages[] | select(. == "go")'

  # Count detected languages
  language-detect . | jq '.languages | length'

Philosophy:
  Fast, evidence-based language detection for tooling.
  Scans marker files (package.json, go.mod, etc.) not all files.
  Outputs JSON for composability with jq, scripts, other tools.

Supported Languages:
  Python, JavaScript, TypeScript, Go, Rust, Ruby, Java, C#,
  PHP, Swift, Kotlin, Scala
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const projectDir = args[0];

  if (!projectDir) {
    console.error("Error: project-dir required");
    printUsage();
    process.exit(2);
  }

  if (!existsSync(projectDir)) {
    console.error(`Error: Directory not found: ${projectDir}`);
    process.exit(2);
  }

  // Detect languages
  const result = await detectLanguages(projectDir);

  // Output JSON (stdout)
  console.log(JSON.stringify(result, null, 2));

  // Diagnostic to stderr
  if (result.languages.length === 0) {
    console.error("ℹ️  No languages detected");
  } else {
    console.error(`✅ Detected: ${result.languages.join(", ")}`);
  }

  process.exit(0);
}

main();
