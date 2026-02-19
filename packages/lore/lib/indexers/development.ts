/**
 * lib/indexers/development.ts - Development projects indexer
 *
 * Scans project directories for .workflow/artifacts/PROJECT_SUMMARY.md
 * and indexes project summaries.
 *
 * Source: development, Topic: project directory name,
 * Type: empty, Timestamp: file mtime as ISO 8601
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexDevelopment(ctx: IndexerContext): Promise<void> {
  const projectsDir = ctx.config.paths.projects;
  if (!checkPath("development", "paths.projects", projectsDir)) return;

  const projects = readdirSync(projectsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const project of projects) {
    const summaryPath = join(
      projectsDir,
      project,
      ".workflow",
      "artifacts",
      "PROJECT_SUMMARY.md",
    );

    if (!existsSync(summaryPath)) continue;

    try {
      const raw = readFileSync(summaryPath, "utf-8");
      const mtime = statSync(summaryPath).mtime;
      const timestamp = mtime.toISOString();

      // Extract tech from **Stack:** line (matches bash script behavior)
      let content = raw;
      let tech: string | undefined;

      const techMatch = raw.match(/^\*\*Stack:\*\*\s*(.+)$/m);
      if (techMatch) {
        tech = techMatch[1].trim();
      }

      const metadata: Record<string, unknown> = {};
      if (tech) metadata.tech = tech;

      ctx.insert({
        source: "development",
        title: `Project: ${project}`,
        content,
        topic: project,
        timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      console.warn(`Failed to read ${summaryPath}: ${e}`);
      continue;
    }
  }
}
