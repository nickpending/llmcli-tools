/**
 * lib/indexers/blogs.ts - Hugo blog posts indexer
 *
 * Scans blog content/posts directory for markdown files.
 * Extracts title, date, categories, tags from frontmatter.
 * Derives URL from filename when slug not available.
 *
 * Source: blogs
 * Topic: frontmatter categories joined (empty if none)
 * Type: (empty)
 * Timestamp: frontmatter date or file mtime as ISO 8601
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, basename } from "path";
import { checkPath, type IndexerContext } from "../indexer";

function walkMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

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

export async function indexBlogs(ctx: IndexerContext): Promise<void> {
  const blogsDir = ctx.config.paths.blogs;
  const postsDir = join(blogsDir, "content", "posts");

  if (!checkPath("blogs", "content/posts", postsDir)) return;

  if (!ctx.config.paths.blog_url) {
    console.warn(
      "WARNING: paths.blog_url not set in config.toml — blog post URLs will not be generated",
    );
  }

  const files = walkMarkdownFiles(postsDir);

  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, "utf-8");

      let content = raw;
      let title = basename(filePath, ".md");
      let date: string | undefined;
      let categories: string[] = [];
      let tags: string[] = [];
      let slug: string | undefined;

      // Extract frontmatter
      const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];

        const titleMatch = frontmatter.match(/^title:\s*"?(.+?)"?$/m);
        const dateMatch = frontmatter.match(/^date:\s*(.+)$/m);
        const slugMatch = frontmatter.match(/^slug:\s*"?(.+?)"?$/m);

        if (titleMatch) title = titleMatch[1].trim();
        if (dateMatch) date = dateMatch[1].trim();
        if (slugMatch) slug = slugMatch[1].trim();

        // Try inline: categories: [foo, bar]
        const categoriesMatch = frontmatter.match(/^categories:\s*\[(.+)\]$/m);
        if (categoriesMatch) {
          categories = categoriesMatch[1]
            .split(",")
            .map((c) => c.trim().replace(/"/g, ""));
        } else {
          // Try multi-line: categories:\n  - foo\n  - bar
          const multiMatch = frontmatter.match(
            /^categories:\s*\n((?:\s+-\s+.+\n?)+)/m,
          );
          if (multiMatch) {
            categories = multiMatch[1]
              .split("\n")
              .map((l) => l.replace(/^\s+-\s+/, "").trim())
              .filter(Boolean);
          }
        }

        // Try inline: tags: [foo, bar]
        const tagsInlineMatch = frontmatter.match(/^tags:\s*\[(.+)\]$/m);
        if (tagsInlineMatch) {
          tags = tagsInlineMatch[1]
            .split(",")
            .map((t) => t.trim().replace(/"/g, ""));
        } else {
          // Try multi-line: tags:\n  - foo\n  - bar
          const tagsMultiMatch = frontmatter.match(
            /^tags:\s*\n((?:\s+-\s+.+\n?)+)/m,
          );
          if (tagsMultiMatch) {
            tags = tagsMultiMatch[1]
              .split("\n")
              .map((l) => l.replace(/^\s+-\s+/, "").trim())
              .filter(Boolean);
          }
        }

        content = raw.slice(frontmatterMatch[0].length);
      }

      // Append tags to content for search visibility
      if (tags.length > 0) {
        content += `\nTags: ${tags.join(", ")}`;
      }

      // Topic from categories
      const topic = categories.length > 0 ? categories.join(" ") : "";

      // URL from slug or filename — requires blog_url in config
      const blogUrl = ctx.config.paths.blog_url;
      const urlSlug = slug || basename(filePath, ".md");
      const url = blogUrl ? `${blogUrl}/posts/${urlSlug}/` : "";

      // Word count
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      const timestamp = date || statSync(filePath).mtime.toISOString();

      const metadata: Record<string, unknown> = {};
      if (url) metadata.url = url;
      if (wordCount) metadata.word_count = wordCount;

      ctx.insert({
        source: "blogs",
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
