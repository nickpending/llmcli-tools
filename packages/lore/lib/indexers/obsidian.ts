/**
 * lib/indexers/obsidian.ts - Obsidian vault indexer
 *
 * Recursively scans obsidian directory for markdown files.
 * Extracts project, domain, and status from frontmatter.
 * Skips personal subdirectory for privacy.
 *
 * Source: obsidian
 * Topic: frontmatter project > domain > parent directory name > empty
 * Type: (empty)
 * Timestamp: file mtime as ISO 8601
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { checkPath, type IndexerContext } from "../indexer";

function walkMarkdownFiles(
  dir: string,
  rootDir: string,
  files: string[] = [],
): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip personal directory (privacy filter)
      if (entry.name === "personal") continue;

      walkMarkdownFiles(fullPath, rootDir, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function indexObsidian(ctx: IndexerContext): Promise<void> {
  const obsidianDir = ctx.config.paths.obsidian;

  if (!checkPath("obsidian", "paths.obsidian", obsidianDir)) return;

  const files = walkMarkdownFiles(obsidianDir, obsidianDir);

  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const mtime = statSync(filePath).mtime;

      let content = raw;
      let project: string | undefined;
      let domain: string | undefined;
      let status: string | undefined;
      let fmDate: string | undefined;
      let fmStarted: string | undefined;

      // Extract frontmatter
      const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];

        // Skip private notes
        const privateMatch = frontmatter.match(/^private:\s*(true|yes)$/m);
        if (privateMatch) continue;

        const projectMatch = frontmatter.match(/^project:\s*(.+)$/m);
        const domainMatch = frontmatter.match(/^domain:\s*(.+)$/m);
        const statusMatch = frontmatter.match(/^status:\s*(.+)$/m);
        const dateMatch = frontmatter.match(/^date:\s*(.+)$/m);
        const startedMatch = frontmatter.match(/^started:\s*(.+)$/m);

        const tagsMatch = frontmatter.match(/^tags:\s*\[(.+)\]$/m);
        const tagsMultiMatch = !tagsMatch
          ? frontmatter.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m)
          : null;

        if (projectMatch) project = projectMatch[1].trim();
        if (domainMatch) domain = domainMatch[1].trim();
        if (statusMatch) status = statusMatch[1].trim();
        if (dateMatch) fmDate = dateMatch[1].trim();
        if (startedMatch) fmStarted = startedMatch[1].trim();

        let tags: string[] = [];
        if (tagsMatch) {
          tags = tagsMatch[1].split(",").map((t) => t.trim().replace(/"/g, ""));
        } else if (tagsMultiMatch) {
          tags = tagsMultiMatch[1]
            .split("\n")
            .map((l) => l.replace(/^\s+-\s+/, "").trim())
            .filter(Boolean);
        }

        content = raw.slice(frontmatterMatch[0].length);

        if (tags.length > 0) {
          content += `\nTags: ${tags.join(", ")}`;
        }
      }

      // Topic derivation: project > domain > parent directory > empty
      let topic = "";
      if (project) {
        topic = project;
      } else if (domain) {
        topic = domain;
      } else {
        const parentDir = basename(dirname(filePath));
        if (parentDir !== basename(obsidianDir)) {
          topic = parentDir;
        }
      }

      // Timestamp cascade: frontmatter date > started > file mtime
      let timestamp: string;
      if (fmDate) {
        timestamp = fmDate.includes("T")
          ? fmDate
          : `${fmDate.slice(0, 10)}T00:00:00Z`;
      } else if (fmStarted) {
        timestamp = fmStarted.includes("T")
          ? fmStarted
          : `${fmStarted.slice(0, 10)}T00:00:00Z`;
      } else {
        timestamp = mtime.toISOString();
      }

      const metadata: Record<string, unknown> = {};
      if (status) metadata.status = status;

      const title = basename(filePath, ".md");

      if (!content.trim()) continue;

      ctx.insert({
        source: "obsidian",
        title,
        content,
        topic,
        timestamp,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (e) {
      console.warn(`Failed to read ${filePath}: ${e}`);
      continue;
    }
  }
}
