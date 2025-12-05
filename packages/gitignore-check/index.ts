/**
 * gitignore-check - Library exports
 *
 * Gitignore compliance checker ensuring projects include essential security patterns.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { checkCompliance } from "gitignore-check";
 *   const result = await checkCompliance("/path/to/project");
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Import language-detect library directly (no subprocess)
import { detectLanguages as detectProjectLanguages } from "language-detect";

// ============================================================================
// Types
// ============================================================================

export interface ComplianceResult {
  compliant: boolean;
  missing?: string[]; // Only when non-compliant
  fixed?: boolean; // Only when non-compliant and fix requested
  error?: string; // Only on error
}

export interface CheckOptions {
  fix?: boolean;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Get the directory where this module's templates are stored
 */
function getTemplatesDir(): string {
  // Handle both ESM and when bundled
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), "templates");
}

/**
 * Normalize gitignore pattern for comparison
 */
function normalizePattern(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
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
 */
function isCoveredBy(pattern: string, existingPatterns: Set<string>): boolean {
  // Exact match
  if (existingPatterns.has(pattern)) {
    return true;
  }

  // Check if a wildcard pattern covers this specific pattern
  for (const existing of existingPatterns) {
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
 * Load and combine all relevant patterns (base + OS + languages)
 */
async function loadAllPatterns(
  projectDir: string,
  templatesDir: string,
): Promise<{ patterns: Set<string>; error?: string }> {
  const allPatterns = new Set<string>();

  // 1. Load base patterns
  const baseGitignorePath = join(templatesDir, "base.gitignore");
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
    const osPath = join(templatesDir, "os", osTemplate);
    if (existsSync(osPath)) {
      const osContent = readFileSync(osPath, "utf-8");
      const osPatterns = extractPatterns(osContent);
      for (const pattern of osPatterns) {
        allPatterns.add(pattern);
      }
    }
  }

  // 3. Load language-specific patterns (using library import)
  try {
    const langResult = await detectProjectLanguages(projectDir);
    for (const lang of langResult.languages) {
      const langPath = join(templatesDir, "languages", `${lang}.gitignore`);
      if (existsSync(langPath)) {
        const langContent = readFileSync(langPath, "utf-8");
        const langPatterns = extractPatterns(langContent);
        for (const pattern of langPatterns) {
          allPatterns.add(pattern);
        }
      }
    }
  } catch {
    // Skip language patterns on error
  }

  return { patterns: allPatterns };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check gitignore compliance for a project
 *
 * @param projectDir - Path to project root directory
 * @param options - Optional settings (fix: boolean)
 * @returns ComplianceResult with compliance status and details
 */
export async function checkCompliance(
  projectDir: string,
  options?: CheckOptions,
): Promise<ComplianceResult> {
  const shouldFix = options?.fix ?? false;

  try {
    const templatesDir = getTemplatesDir();

    // Load all relevant patterns (base + OS + languages)
    const { patterns: requiredPatterns, error: loadError } =
      await loadAllPatterns(projectDir, templatesDir);

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

      if (existsSync(projectGitignorePath)) {
        appendFileSync(projectGitignorePath, additions);
      } else {
        writeFileSync(projectGitignorePath, additions.trim() + "\n");
      }
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
