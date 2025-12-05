#!/usr/bin/env bun
/**
 * gitignore-check CLI
 *
 * Philosophy:
 * - Security by default - Never commit secrets, credentials, or sensitive data
 * - Incremental enforcement - Only adds missing patterns, preserves existing
 * - Pattern coverage - Detects functional equivalents (e.g., .env* covers .env)
 * - Deterministic output - JSON for composability with jq, grep, etc.
 *
 * Usage:
 *   gitignore-check <project-dir> [--fix]
 *
 * Exit codes:
 *   0 - Compliant (all base patterns present)
 *   1 - Non-compliant (missing patterns found)
 *   2 - Error (file read failure, invalid args)
 */

import { checkCompliance } from "./index";

/**
 * Print usage and exit
 */
function printUsage(): void {
  console.error(`
gitignore-check - Gitignore Compliance Checker

Usage: gitignore-check <project-dir> [--fix]

Arguments:
  project-dir  Path to project root (containing .gitignore)
  --fix        Auto-fix by appending missing patterns (optional)

Exit codes:
  0 - Compliant (all base patterns present)
  1 - Non-compliant (missing patterns found)
  2 - Error (file read failure, invalid args)

Examples:
  # Check compliance
  gitignore-check .
  gitignore-check /path/to/project

  # Check and auto-fix
  gitignore-check . --fix

  # Use with jq
  gitignore-check . | jq '.missing'
  gitignore-check . | jq -r '.missing[]'

Philosophy:
  This tool enforces security-first gitignore patterns to prevent
  accidental commits of secrets, credentials, and sensitive data.

  It follows the llcli pattern:
  - Simple: Manual argument parsing, zero framework dependencies
  - Deterministic: JSON output for composability
  - Focused: Does one thing well

  Base patterns include:
  - Security: .env files, API keys, secrets, credentials
  - Workspace: .workflow/, .claude/, .claudex/, .mcp.json
  - Build artifacts: dist/, logs/, coverage/
  - IDE files: .vscode/, .idea/
  - System files: .DS_Store, Thumbs.db
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
  const shouldFix = args.includes("--fix");

  if (!projectDir) {
    console.error("Error: project-dir required");
    printUsage();
    process.exit(2);
  }

  // Run compliance check
  const result = await checkCompliance(projectDir, { fix: shouldFix });

  // Output JSON (stdout)
  console.log(JSON.stringify(result, null, 2));

  // Emit diagnostic to stderr (doesn't pollute JSON output)
  if (!result.compliant) {
    if (result.error) {
      console.error(`❌ Gitignore compliance error: ${result.error}`);
    } else {
      console.error(
        `⚠️  Gitignore missing ${result.missing?.length || 0} base pattern(s)`,
      );
      if (result.fixed) {
        console.error("✅ Auto-fixed by appending missing patterns");
      } else {
        console.error("   Run with --fix to auto-fix");
      }
    }
  } else {
    console.error("✅ Gitignore compliance: OK");
  }

  // Exit with appropriate code
  if (result.error) {
    process.exit(2);
  } else if (!result.compliant && !result.fixed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
