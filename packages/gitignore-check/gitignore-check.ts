#!/usr/bin/env bun
/**
 * gitignore-check - Gitignore Compliance Checker
 *
 * Ensures project .gitignore files include essential security patterns.
 * Follows the llcli pattern: simple, deterministic, composable.
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
 * Examples:
 *   gitignore-check .                    # Check current directory
 *   gitignore-check /path/to/project     # Check specific project
 *   gitignore-check . --fix              # Auto-fix by appending missing patterns
 *   gitignore-check . | jq '.missing'    # Show only missing patterns
 *
 * Exit codes:
 *   0 - Compliant (all base patterns present)
 *   1 - Non-compliant (missing patterns found)
 *   2 - Error (file read failure, invalid args)
 */

import { readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";

interface ComplianceResult {
  compliant: boolean;
  missing?: string[]; // Only when non-compliant
  fixed?: boolean; // Only when non-compliant and --fix used
  error?: string; // Only on error
}

/**
 * Normalize gitignore pattern for comparison
 * - Trim whitespace
 * - Remove comments
 * - Ignore blank lines
 */
function normalizePattern(line: string): string | null {
  const trimmed = line.trim();

  // Skip empty lines
  if (!trimmed) return null;

  // Skip comments
  if (trimmed.startsWith("#")) return null;

  return trimmed;
}

/**
 * Extract patterns from gitignore content
 */
function extractPatterns(content: string): Set<string> {
  const patterns = new Set<string>();

  for (const line of content.split("\n")) {
    const pattern = normalizePattern(line);
    if (pattern) {
      patterns.add(pattern);
    }
  }

  return patterns;
}

/**
 * Check if pattern is functionally covered by existing patterns
 *
 * Examples:
 * - ".env" is covered by ".env*"
 * - ".env.local" is covered by ".env*"
 * - "*.log" is covered by existing "*.log"
 */
function isCoveredBy(pattern: string, existingPatterns: Set<string>): boolean {
  // Exact match
  if (existingPatterns.has(pattern)) {
    return true;
  }

  // Check if a wildcard pattern covers this specific pattern
  for (const existing of existingPatterns) {
    // ".env*" covers ".env", ".env.local", etc.
    if (existing.includes("*")) {
      const prefix = existing.replace(/\*/g, "");
      if (pattern.startsWith(prefix)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect OS and return template filename
 */
function detectOS(): string | null {
  switch (process.platform) {
    case "darwin":
      return "macos.gitignore";
    case "linux":
      return "linux.gitignore";
    case "win32":
      return "windows.gitignore";
    default:
      return null;
  }
}

/**
 * Detect project languages using language-detect CLI
 */
async function detectLanguages(projectDir: string): Promise<string[]> {
  try {
    const scriptDir = import.meta.dir;
    const languageDetectPath = join(
      scriptDir,
      "..",
      "language-detect",
      "language-detect.ts",
    );

    if (!existsSync(languageDetectPath)) {
      console.error(
        "⚠️  language-detect not found, skipping language patterns",
      );
      return [];
    }

    const proc = Bun.spawnSync(["bun", languageDetectPath, projectDir]);

    if (proc.exitCode !== 0) {
      return [];
    }

    const output = proc.stdout.toString();
    const result = JSON.parse(output);

    return result.languages || [];
  } catch {
    return [];
  }
}

/**
 * Load and combine all relevant patterns (base + OS + languages)
 */
async function loadAllPatterns(
  projectDir: string,
  scriptDir: string,
): Promise<{ patterns: Set<string>; error?: string }> {
  const allPatterns = new Set<string>();

  // 1. Load base patterns
  const baseGitignorePath = join(scriptDir, "templates", "base.gitignore");
  if (!existsSync(baseGitignorePath)) {
    return {
      patterns: allPatterns,
      error: `Base template not found: ${baseGitignorePath}`,
    };
  }

  const baseContent = readFileSync(baseGitignorePath, "utf-8");
  const basePatterns = extractPatterns(baseContent);
  for (const pattern of basePatterns) {
    allPatterns.add(pattern);
  }

  // 2. Load OS-specific patterns
  const osTemplate = detectOS();
  if (osTemplate) {
    const osPath = join(scriptDir, "templates", "os", osTemplate);
    if (existsSync(osPath)) {
      const osContent = readFileSync(osPath, "utf-8");
      const osPatterns = extractPatterns(osContent);
      for (const pattern of osPatterns) {
        allPatterns.add(pattern);
      }
    }
  }

  // 3. Load language-specific patterns
  const languages = await detectLanguages(projectDir);
  for (const lang of languages) {
    const langPath = join(
      scriptDir,
      "templates",
      "languages",
      `${lang}.gitignore`,
    );
    if (existsSync(langPath)) {
      const langContent = readFileSync(langPath, "utf-8");
      const langPatterns = extractPatterns(langContent);
      for (const pattern of langPatterns) {
        allPatterns.add(pattern);
      }
    }
  }

  return { patterns: allPatterns };
}

/**
 * Main compliance check
 */
async function checkCompliance(
  projectDir: string,
  shouldFix: boolean,
): Promise<ComplianceResult> {
  try {
    const scriptDir = import.meta.dir;

    // Load all relevant patterns (base + OS + languages)
    const { patterns: requiredPatterns, error: loadError } =
      await loadAllPatterns(projectDir, scriptDir);

    if (loadError) {
      return {
        compliant: false,
        missing: [],
        fixed: false,
        error: loadError,
      };
    }

    // Read project .gitignore
    const projectGitignorePath = join(projectDir, ".gitignore");

    let projectPatterns = new Set<string>();

    if (existsSync(projectGitignorePath)) {
      const projectContent = readFileSync(projectGitignorePath, "utf-8");
      projectPatterns = extractPatterns(projectContent);
    } else if (!shouldFix) {
      // No .gitignore and not fixing - error
      return {
        compliant: false,
        missing: Array.from(requiredPatterns),
        fixed: false,
        error: "Project .gitignore not found",
      };
    }

    // Find missing patterns
    const missing: string[] = [];

    for (const requiredPattern of requiredPatterns) {
      if (!isCoveredBy(requiredPattern, projectPatterns)) {
        missing.push(requiredPattern);
      }
    }

    // Fix if requested
    let fixed = false;
    if (shouldFix && missing.length > 0) {
      const additions = [
        "",
        "# Base compliance patterns (auto-added by gitignore-check)",
        ...missing,
        "",
      ].join("\n");

      appendFileSync(projectGitignorePath, additions);
      fixed = true;
    }

    // Terse output: only emit actionable fields
    if (missing.length === 0) {
      return { compliant: true };
    }

    return {
      compliant: false,
      missing,
      fixed,
    };
  } catch (error) {
    return {
      compliant: false,
      missing: [],
      fixed: false,
      error: String(error),
    };
  }
}

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
  const result = await checkCompliance(projectDir, shouldFix);

  // Output JSON (stdout)
  console.log(JSON.stringify(result, null, 2));

  // Emit diagnostic to stderr (doesn't pollute JSON output)
  if (!result.compliant) {
    if (result.error) {
      console.error(`❌ Gitignore compliance error: ${result.error}`);
    } else {
      console.error(
        `⚠️  Gitignore missing ${result.missing.length} base pattern(s)`,
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
