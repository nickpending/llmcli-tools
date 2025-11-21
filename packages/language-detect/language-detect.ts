#!/usr/bin/env bun
/**
 * language-detect - Project Language Detector
 *
 * Detects programming languages used in a project by examining marker files
 * and file extensions. Outputs deterministic JSON for composability.
 *
 * Philosophy:
 * - Evidence-based detection - Shows WHY each language was detected
 * - Fast scanning - Only checks markers, not full file enumeration
 * - Composable output - JSON pipes to jq, other tools
 * - Useful standalone - Debugging, CI/CD, tool integration
 *
 * Usage:
 *   language-detect <project-dir>
 *
 * Examples:
 *   language-detect .                           # Detect current directory
 *   language-detect /path/to/project            # Detect specific project
 *   language-detect . | jq '.languages[]'       # List languages
 *   language-detect . | jq '.markers.python'    # Show Python evidence
 *
 * Exit codes:
 *   0 - Success (languages detected or none found)
 *   2 - Error (invalid args, directory not found)
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

interface LanguageMarker {
  files: string[]; // Marker filenames to check
  extensions?: string[]; // File extensions (optional, for verification)
}

interface DetectionResult {
  languages: string[];
  markers: Record<string, string[]>; // language -> evidence (why each detected)
}

/**
 * Minimum files needed for extension-based detection (when no markers found)
 * 0 = detect any files, 3 = need 3+ files, etc.
 */
const EXTENSION_THRESHOLD = 0;

/**
 * Language detection markers
 * Based on GitHub's linguist and common conventions
 */
const LANGUAGE_MARKERS: Record<string, LanguageMarker> = {
  python: {
    files: [
      "pyproject.toml",
      "requirements.txt",
      "setup.py",
      "Pipfile",
      "poetry.lock",
    ],
    extensions: [".py"],
  },
  javascript: {
    files: ["package.json", "yarn.lock", "package-lock.json"],
    extensions: [".js", ".mjs", ".cjs"],
  },
  typescript: {
    files: ["tsconfig.json", "package.json"],
    extensions: [".ts", ".tsx"],
  },
  go: {
    files: ["go.mod", "go.sum", "Gopkg.toml"],
    extensions: [".go"],
  },
  rust: {
    files: ["Cargo.toml", "Cargo.lock"],
    extensions: [".rs"],
  },
  ruby: {
    files: ["Gemfile", "Gemfile.lock", "Rakefile"],
    extensions: [".rb"],
  },
  java: {
    files: ["pom.xml", "build.gradle", "build.gradle.kts", "gradlew"],
    extensions: [".java"],
  },
  csharp: {
    files: [".csproj", ".sln", "packages.config"],
    extensions: [".cs"],
  },
  php: {
    files: ["composer.json", "composer.lock"],
    extensions: [".php"],
  },
  swift: {
    files: ["Package.swift", ".xcodeproj"],
    extensions: [".swift"],
  },
  kotlin: {
    files: ["build.gradle.kts"],
    extensions: [".kt", ".kts"],
  },
  scala: {
    files: ["build.sbt", "build.scala"],
    extensions: [".scala"],
  },
};

/**
 * Check if a file exists in directory (case-insensitive for some markers)
 */
function fileExists(dir: string, filename: string): boolean {
  const fullPath = join(dir, filename);
  return existsSync(fullPath);
}

/**
 * Check for files with specific extension in directory (shallow scan)
 */
function hasFilesWithExtension(dir: string, extension: string): boolean {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      // Check files
      if (stat.isFile() && entry.endsWith(extension)) {
        return true;
      }

      // Shallow check in immediate subdirectories (not recursive)
      if (stat.isDirectory() && !entry.startsWith(".")) {
        try {
          const subEntries = readdirSync(fullPath);
          if (subEntries.some((sub) => sub.endsWith(extension))) {
            return true;
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    }
  } catch {
    // Skip on error
  }

  return false;
}

/**
 * Count files with specific extension (recursive with depth limit)
 * Used as fallback when no marker files found
 */
function countFilesWithExtension(
  dir: string,
  extension: string,
  maxDepth: number = 3,
  currentDepth: number = 0,
): number {
  if (currentDepth >= maxDepth) return 0;

  let count = 0;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      // Skip hidden directories and common exclusions
      if (
        entry.startsWith(".") ||
        entry === "node_modules" ||
        entry === "vendor" ||
        entry === "target"
      ) {
        continue;
      }

      const fullPath = join(dir, entry);
      let stat;

      try {
        stat = statSync(fullPath);
      } catch {
        continue; // Skip inaccessible entries
      }

      if (stat.isFile() && entry.endsWith(extension)) {
        count++;
      } else if (stat.isDirectory()) {
        count += countFilesWithExtension(
          fullPath,
          extension,
          maxDepth,
          currentDepth + 1,
        );
      }
    }
  } catch {
    // Skip on error
  }

  return count;
}

/**
 * Detect languages in project directory
 */
async function detectLanguages(projectDir: string): Promise<DetectionResult> {
  const detected = new Map<string, string[]>();

  // Phase 1: Check each language's markers
  for (const [language, marker] of Object.entries(LANGUAGE_MARKERS)) {
    const evidence: string[] = [];

    // Check for marker files
    for (const file of marker.files) {
      if (fileExists(projectDir, file)) {
        evidence.push(file);
      }
    }

    // If marker files found, verify with extensions (if specified)
    if (evidence.length > 0 && marker.extensions) {
      for (const ext of marker.extensions) {
        if (hasFilesWithExtension(projectDir, ext)) {
          evidence.push(`*${ext} files`);
          break; // Only need to confirm once
        }
      }
    }

    if (evidence.length > 0) {
      detected.set(language, evidence);
    }
  }

  // Phase 2: Extension-based fallback (when no markers found)
  for (const [language, marker] of Object.entries(LANGUAGE_MARKERS)) {
    // Skip if already detected via markers
    if (detected.has(language)) continue;

    // Only fallback if extensions defined
    if (!marker.extensions || marker.extensions.length === 0) continue;

    const evidence: string[] = [];

    // Count files for each extension
    for (const ext of marker.extensions) {
      const count = countFilesWithExtension(projectDir, ext);
      if (count > EXTENSION_THRESHOLD) {
        evidence.push(`${count} *${ext} files`);
      }
    }

    if (evidence.length > 0) {
      detected.set(language, evidence);
    }
  }

  // Build result
  const languages = Array.from(detected.keys()).sort();
  const markers: Record<string, string[]> = {};

  for (const [lang, evidence] of detected) {
    markers[lang] = evidence;
  }

  // Terse output: drop scanned field (caller knows the directory)
  return {
    languages,
    markers,
  };
}

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
