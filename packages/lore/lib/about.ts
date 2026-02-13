/**
 * lib/about.ts - Project knowledge aggregation
 *
 * Aggregates all knowledge sources for a given project.
 * Uses parallel queries via Promise.all for performance.
 */

import { list, formatBriefList, type ListResult, type Source } from "./list";

export interface AboutOptions {
  brief?: boolean;
  limit?: number;
}

export interface AboutResult {
  project: string;
  commits: ListResult;
  captures: ListResult;
  flux: ListResult;
  teachings: ListResult;
  sessions: ListResult;
}

/**
 * Sources to query for project knowledge
 * Each source has a different field for project mapping (handled by list.ts)
 * Note: "insights" will be added when task 2.1 is complete
 */
const ABOUT_SOURCES: Source[] = [
  "commits",
  "captures",
  "flux",
  "teachings",
  "sessions",
];

/**
 * Get aggregated knowledge about a project across all sources
 *
 * @param project - Project name to query
 * @param options - Optional brief flag and limit
 * @returns AboutResult with data from all sources, or formatted string if brief
 */
export function about(
  project: string,
  options: AboutOptions = {},
): AboutResult {
  const limit = options.limit ?? 10;

  // Query all sources in parallel
  const results = ABOUT_SOURCES.map((src) => {
    try {
      return list(src, { project, limit });
    } catch {
      // Source doesn't exist or has no data - return empty result
      return {
        source: src,
        entries: [],
        count: 0,
      } as ListResult;
    }
  });

  return {
    project,
    commits: results[0],
    captures: results[1],
    flux: results[2],
    teachings: results[3],
    sessions: results[4],
  };
}

/**
 * Format about result as brief, compact output
 * Groups by source, skips empty sources
 */
export function formatBriefAbout(result: AboutResult): string {
  const sections: string[] = [];

  // Format each non-empty source
  if (result.commits.count > 0) {
    sections.push(formatBriefList(result.commits));
  }
  if (result.captures.count > 0) {
    sections.push(formatBriefList(result.captures));
  }
  if (result.flux.count > 0) {
    sections.push(formatBriefList(result.flux));
  }
  if (result.teachings.count > 0) {
    sections.push(formatBriefList(result.teachings));
  }
  if (result.sessions.count > 0) {
    sections.push(formatBriefList(result.sessions));
  }

  if (sections.length === 0) {
    return `(no results for project: ${result.project})`;
  }

  return sections.join("\n\n");
}
