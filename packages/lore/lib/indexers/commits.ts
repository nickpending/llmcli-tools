/**
 * lib/indexers/commits.ts - Git commits indexer
 *
 * Scans all project directories for git repos and indexes commit history.
 * Uses record/unit separators to avoid delimiter collisions in messages.
 *
 * Source: commits
 * Topic: project directory name (repo name)
 * Type: (empty)
 * Timestamp: commit author date as ISO 8601
 */

import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import type { IndexerContext } from "../indexer";

export async function indexCommits(ctx: IndexerContext): Promise<void> {
  const projectsDir = ctx.config.paths.projects;

  if (!existsSync(projectsDir)) {
    console.log(`Projects directory not found: ${projectsDir}`);
    return;
  }

  const projects = readdirSync(projectsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const project of projects) {
    const repoPath = join(projectsDir, project);
    const gitDir = join(repoPath, ".git");

    if (!existsSync(gitDir)) continue;

    try {
      // Use record separator (%x1e) and unit separator (%x1f) to avoid
      // delimiter collisions with commit message content
      const SEP = "\x1e"; // Record separator between commits
      const UNIT = "\x1f"; // Unit separator between fields
      const result = spawnSync(
        "git",
        [
          "log",
          "--all",
          `--format=${SEP}%H${UNIT}%an${UNIT}%aI${UNIT}%s${UNIT}%b`,
        ],
        {
          cwd: repoPath,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
      );

      if (result.error || result.status !== 0) {
        console.warn(`Failed to read git log for ${project}: ${result.stderr}`);
        continue;
      }

      const records = result.stdout.split(SEP).filter(Boolean);

      for (const record of records) {
        const parts = record.split(UNIT);
        if (parts.length < 4) continue;

        const [sha, author, timestamp, subject, ...bodyParts] = parts;
        const body = bodyParts.join("").trim();
        const baseContent = body || subject;
        const content = author
          ? `Author: ${author}\n${baseContent}`
          : baseContent;

        ctx.insert({
          source: "commits",
          title: `[commit] ${subject}`,
          content,
          topic: project,
          timestamp,
          metadata: {
            sha: sha.trim(),
            author,
          },
        });
      }
    } catch (e) {
      console.warn(`Failed to index commits for ${project}: ${e}`);
      continue;
    }
  }
}
