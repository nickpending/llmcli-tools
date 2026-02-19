/**
 * lib/indexers/readmes.ts - READMEs indexer
 *
 * Scans project directories for README.md and indexes content.
 * Framework handles chunking for large READMEs.
 *
 * Source: readmes, Topic: project directory name,
 * Type: empty, Timestamp: file mtime as ISO 8601
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { checkPath, type IndexerContext } from "../indexer";

export async function indexReadmes(ctx: IndexerContext): Promise<void> {
  const projectsDir = ctx.config.paths.projects;
  if (!checkPath("readmes", "paths.projects", projectsDir)) return;

  const projects = readdirSync(projectsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const project of projects) {
    const readmePath = join(projectsDir, project, "README.md");

    if (!existsSync(readmePath)) continue;

    try {
      const content = readFileSync(readmePath, "utf-8");
      const mtime = statSync(readmePath).mtime;
      const timestamp = mtime.toISOString();

      ctx.insert({
        source: "readmes",
        title: `README: ${project}`,
        content,
        topic: project,
        timestamp,
      });
    } catch (e) {
      console.warn(`Failed to read ${readmePath}: ${e}`);
      continue;
    }
  }
}
