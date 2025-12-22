/**
 * expertise-update - Library exports
 *
 * Sync Lore insights into PROJECT_EXPERTISE.toml [insights] section.
 * Pure functions, no process.exit, no stderr output.
 *
 * Usage:
 *   import { updateExpertise } from "expertise-update";
 *   const result = await updateExpertise("argus", "~/development/projects/argus");
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse, stringify } from "smol-toml";
import { search, type SearchResult } from "lore-search";

export interface ExpertiseResult {
  updated: boolean;
  insights_added: number;
  total_insights: number;
  error?: string;
}

interface ExpertiseToml {
  meta?: {
    project?: string;
    updated?: string;
    domains?: string[];
  };
  domains?: Record<string, unknown>;
  insights?: {
    gotchas?: string[];
    decisions?: string[];
    learnings?: string[];
  };
  [key: string]: unknown;
}

/**
 * Extract insight text from search result
 * Strips capture type prefix and project name from content
 */
function extractInsight(result: SearchResult, project: string): string {
  let text = result.content;

  // Remove snippet markers
  text = text.replace(/→|←/g, "");

  // Remove capture type prefixes like "gotcha argus:" or "decision argus -"
  const prefixPattern = new RegExp(
    `^(gotcha|decision|learning)\\s+${project}[:\\s-]+`,
    "i",
  );
  text = text.replace(prefixPattern, "");

  // Clean up whitespace
  text = text.trim();

  return text;
}

/**
 * Query Lore for project-specific captures
 */
function queryLoreInsights(
  project: string,
  type: "gotcha" | "decision" | "learning",
): string[] {
  try {
    const results = search(`${type} ${project}`, {
      source: "events",
      limit: 50,
    });
    return results
      .map((r) => extractInsight(r, project))
      .filter((text) => text.length > 0);
  } catch {
    // Lore database may not exist or have no events
    return [];
  }
}

/**
 * Deduplicate insights by normalized content
 */
function deduplicate(insights: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const insight of insights) {
    const normalized = insight.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(insight);
    }
  }

  return result;
}

/**
 * Merge new insights with existing (additive, no duplicates)
 */
function mergeInsights(
  existing: string[],
  incoming: string[],
): { merged: string[]; added: number } {
  const existingNormalized = new Set(
    existing.map((s) => s.toLowerCase().trim()),
  );

  const newInsights: string[] = [];
  for (const insight of incoming) {
    const normalized = insight.toLowerCase().trim();
    if (!existingNormalized.has(normalized)) {
      newInsights.push(insight);
      existingNormalized.add(normalized);
    }
  }

  return {
    merged: [...existing, ...newInsights],
    added: newInsights.length,
  };
}

/**
 * Update PROJECT_EXPERTISE.toml with Lore insights
 *
 * @param project - Project name for Lore queries
 * @param root - Project root directory path
 * @returns Result with update statistics
 */
export async function updateExpertise(
  project: string,
  root: string,
): Promise<ExpertiseResult> {
  // Expand ~ in path
  const expandedRoot = root.replace(/^~/, process.env.HOME || "");
  const expertisePath = join(
    expandedRoot,
    ".workflow",
    "artifacts",
    "PROJECT_EXPERTISE.toml",
  );

  // Silent exit if no expertise file
  if (!existsSync(expertisePath)) {
    return {
      updated: false,
      insights_added: 0,
      total_insights: 0,
    };
  }

  // Read existing expertise
  let expertise: ExpertiseToml;
  try {
    const content = readFileSync(expertisePath, "utf-8");
    expertise = parse(content) as ExpertiseToml;
  } catch (error) {
    return {
      updated: false,
      insights_added: 0,
      total_insights: 0,
      error: `Failed to parse TOML: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  // Initialize insights section if missing
  if (!expertise.insights) {
    expertise.insights = {
      gotchas: [],
      decisions: [],
      learnings: [],
    };
  }

  // Query Lore for each capture type
  const gotchas = deduplicate(queryLoreInsights(project, "gotcha"));
  const decisions = deduplicate(queryLoreInsights(project, "decision"));
  const learnings = deduplicate(queryLoreInsights(project, "learning"));

  // Merge with existing (additive)
  const gotchaResult = mergeInsights(expertise.insights.gotchas || [], gotchas);
  const decisionResult = mergeInsights(
    expertise.insights.decisions || [],
    decisions,
  );
  const learningResult = mergeInsights(
    expertise.insights.learnings || [],
    learnings,
  );

  expertise.insights.gotchas = gotchaResult.merged;
  expertise.insights.decisions = decisionResult.merged;
  expertise.insights.learnings = learningResult.merged;

  const totalAdded =
    gotchaResult.added + decisionResult.added + learningResult.added;
  const totalInsights =
    gotchaResult.merged.length +
    decisionResult.merged.length +
    learningResult.merged.length;

  // Only write if there are changes
  if (totalAdded === 0) {
    return {
      updated: false,
      insights_added: 0,
      total_insights: totalInsights,
    };
  }

  // Write updated TOML
  try {
    const output = stringify(expertise);
    writeFileSync(expertisePath, output, "utf-8");
  } catch (error) {
    return {
      updated: false,
      insights_added: 0,
      total_insights: totalInsights,
      error: `Failed to write TOML: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  return {
    updated: true,
    insights_added: totalAdded,
    total_insights: totalInsights,
  };
}
