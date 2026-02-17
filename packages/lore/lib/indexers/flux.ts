/**
 * lib/indexers/flux.ts - Flux indexer
 *
 * Scans flux markdown files for todo and idea entries.
 * Two passes: general flux (no project) and per-project flux.
 * Line format: `- todo:: description id::xxx captured::date`
 *              `- idea:: description id::xxx`
 *
 * Source: flux
 * Topic: project directory name, or "general" for non-project items
 * Type: todo or idea
 * Timestamp: captured date if present, otherwise empty
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import type { IndexerContext } from "../indexer";

export async function indexFlux(ctx: IndexerContext): Promise<void> {
  const fluxDir = ctx.config.paths.flux;
  const fluxProjectsDir = ctx.config.paths.flux_projects;
  let found = false;

  // Pass 1: General flux files (no project association)
  if (fluxDir && existsSync(fluxDir)) {
    found = true;
    const files = readdirSync(fluxDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = join(fluxDir, file);
      const status = statusFromFilename(basename(file, ".md"));
      try {
        parseFluxFile(ctx, filePath, "general", status);
      } catch (e) {
        console.warn(`Failed to read ${filePath}: ${e}`);
      }
    }
  }

  // Pass 2: Per-project flux files (active.md, later.md)
  if (fluxProjectsDir && existsSync(fluxProjectsDir)) {
    found = true;
    const projects = readdirSync(fluxProjectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const project of projects) {
      for (const filename of ["active.md", "later.md"]) {
        const filePath = join(fluxProjectsDir, project, filename);
        if (!existsSync(filePath)) continue;
        const status = statusFromFilename(basename(filename, ".md"));
        try {
          parseFluxFile(ctx, filePath, project, status);
        } catch (e) {
          console.warn(`Failed to read ${filePath}: ${e}`);
        }
      }
    }
  }

  if (!found) {
    console.log("No flux directories found, skipping flux");
  }
}

function statusFromFilename(name: string): string {
  switch (name) {
    case "active":
      return "active";
    case "later":
      return "later";
    case "inbox":
      return "inbox";
    default:
      return "other";
  }
}

function parseFluxFile(
  ctx: IndexerContext,
  filePath: string,
  topic: string,
  status: string,
): void {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  for (const line of lines) {
    const match = line.match(/^- (todo|idea):: (.+)/);
    if (!match) continue;

    const type = match[1];
    let rest = match[2];

    // Extract id if present
    let id = "";
    const idMatch = rest.match(/\bid::(\S+)/);
    if (idMatch) {
      id = idMatch[1];
      rest = rest.replace(/\s*id::\S+/, "");
    }

    // Extract captured date if present (may include time: captured:: 2025-08-13 10:52)
    let timestamp = "";
    const capturedMatch = rest.match(
      /\bcaptured::\s*(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?/,
    );
    if (capturedMatch) {
      timestamp = `${capturedMatch[1]}T00:00:00Z`;
      rest = rest.replace(
        /\s*captured::\s*\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/,
        "",
      );
    }

    // Extract archived date if present (strip from description)
    rest = rest.replace(/\s*archived::\s*\S+/, "");

    // Extract any remaining key::value pairs (like last::date)
    rest = rest.replace(/\s*\w+::\s*\S+/g, "");

    const description = rest.trim();
    if (!description) continue;

    const title =
      topic !== "general"
        ? `[${topic}] [${type}] ${description.slice(0, 80)}`
        : `[${type}] ${description.slice(0, 80)}`;

    ctx.insert({
      source: "flux",
      title,
      content: description,
      topic,
      type,
      timestamp,
      metadata: {
        id,
        status,
      },
    });
  }
}
