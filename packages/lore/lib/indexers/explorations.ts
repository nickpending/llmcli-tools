/**
 * lib/indexers/explorations.ts - Explorations indexer
 *
 * Recursively scans explorations directory for markdown files.
 * Extracts project and status from frontmatter when available.
 *
 * Source: explorations
 * Topic: frontmatter project or parent directory name
 * Type: (empty)
 * Timestamp: file mtime as ISO 8601
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { checkPath, type IndexerContext } from "../indexer";

function walkMarkdownFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      walkMarkdownFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function indexExplorations(ctx: IndexerContext): Promise<void> {
  const explorationsDir = ctx.config.paths.explorations;

  if (!checkPath("explorations", "paths.explorations", explorationsDir)) return;

  const files = walkMarkdownFiles(explorationsDir);

  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const mtime = statSync(filePath).mtime;
      const timestamp = mtime.toISOString();

      let content = raw;
      let project: string | undefined;
      let status: string | undefined;

      // Extract frontmatter
      const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const projectMatch = frontmatter.match(/^project:\s*(.+)$/m);
        const statusMatch = frontmatter.match(/^status:\s*(.+)$/m);

        if (projectMatch) project = projectMatch[1].trim();
        if (statusMatch) status = statusMatch[1].trim();

        content = raw.slice(frontmatterMatch[0].length);
      }

      // Fallback: use parent directory name as project
      if (!project) {
        project = basename(dirname(filePath));
      }

      const metadata: Record<string, unknown> = {};
      if (status) metadata.status = status;

      const title = basename(filePath, ".md");

      ctx.insert({
        source: "explorations",
        title: `[exploration] ${title}`,
        content,
        topic: project,
        timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      console.warn(`Failed to read ${filePath}: ${e}`);
      continue;
    }
  }
}
