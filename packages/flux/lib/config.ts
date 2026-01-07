import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface FluxConfig {
  paths: {
    data_dir: string;
    projects_dir: string;
  };
  projects: {
    known?: string[]; // Optional allowlist, empty means auto-discover
  };
  behavior: {
    archive_after_days: number;
  };
}

export interface FluxPaths {
  active: string;
  later: string;
  recurring: string;
  daily: string;
  archive: string;
  projects: string;
}

const CONFIG_PATH = join(process.env.HOME ?? "", ".config/flux/config.toml");

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(process.env.HOME ?? "", path.slice(2));
  }
  return path;
}

function parseToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      const parts = currentSection.split(".");
      let obj = result;
      for (const part of parts) {
        obj[part] = obj[part] ?? {};
        obj = obj[part] as Record<string, unknown>;
      }
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      let value: unknown;

      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        value = rawValue.slice(1, -1);
      } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        value = rawValue
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      } else if (rawValue === "true") {
        value = true;
      } else if (rawValue === "false") {
        value = false;
      } else if (!isNaN(Number(rawValue))) {
        value = Number(rawValue);
      } else {
        value = rawValue;
      }

      if (currentSection) {
        const parts = currentSection.split(".");
        let obj = result;
        for (const part of parts) {
          obj = obj[part] as Record<string, unknown>;
        }
        obj[key] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

export async function loadConfig(): Promise<FluxConfig> {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config not found: ${CONFIG_PATH}\n` +
        "Create ~/.config/flux/config.toml with:\n\n" +
        "[paths]\n" +
        'data_dir = "~/obsidian/flux"\n' +
        'projects_dir = "~/obsidian/projects"\n\n' +
        "[projects]\n" +
        'known = ["project1", "project2"]\n\n' +
        "[behavior]\n" +
        "archive_after_days = 7",
    );
  }

  const content = await Bun.file(CONFIG_PATH).text();
  const parsed = parseToml(content) as {
    paths?: { data_dir?: string; projects_dir?: string };
    projects?: { known?: string[] };
    behavior?: { archive_after_days?: number };
  };

  // Validate required fields
  if (!parsed.paths?.data_dir) {
    throw new Error("Config missing: paths.data_dir");
  }
  if (!parsed.paths?.projects_dir) {
    throw new Error("Config missing: paths.projects_dir");
  }

  return {
    paths: {
      data_dir: expandPath(parsed.paths.data_dir),
      projects_dir: expandPath(parsed.paths.projects_dir),
    },
    projects: {
      known: parsed.projects?.known,
    },
    behavior: {
      archive_after_days: parsed.behavior?.archive_after_days ?? 7,
    },
  };
}

export function getPaths(config: FluxConfig): FluxPaths {
  return {
    active: join(config.paths.data_dir, "active.md"),
    later: join(config.paths.data_dir, "later.md"),
    recurring: join(config.paths.data_dir, "recurring.md"),
    daily: join(config.paths.data_dir, "daily"),
    archive: join(config.paths.data_dir, "archive"),
    projects: config.paths.projects_dir,
  };
}

export function getProjectBacklogPath(
  config: FluxConfig,
  project: string,
): string {
  return join(config.paths.projects_dir, project, "later.md");
}

export function getProjectChangelogPath(
  config: FluxConfig,
  project: string,
): string {
  return join(config.paths.projects_dir, project, "completed.md");
}

export function getDailyPath(config: FluxConfig, date: Date): string {
  const dateStr = formatDate(date);
  return join(config.paths.data_dir, "daily", `${dateStr}.md`);
}

export function getArchivePath(config: FluxConfig, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return join(config.paths.data_dir, "archive", `${year}-${month}.md`);
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: Date): string {
  const dateStr = formatDate(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${dateStr} ${hours}:${minutes}`;
}

export function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function discoverProjects(config: FluxConfig): string[] {
  const projectsDir = config.paths.projects_dir;
  if (!existsSync(projectsDir)) {
    return [];
  }
  return readdirSync(projectsDir).filter((name) => {
    const fullPath = join(projectsDir, name);
    return statSync(fullPath).isDirectory() && !name.startsWith(".");
  });
}

export function isKnownProject(config: FluxConfig, project: string): boolean {
  // Check if project directory exists in projects_dir
  const projectDir = join(config.paths.projects_dir, project);
  return existsSync(projectDir) && statSync(projectDir).isDirectory();
}

export function validateProject(config: FluxConfig, project: string): void {
  if (!isKnownProject(config, project)) {
    const discovered = discoverProjects(config);
    const projectList =
      discovered.length > 0 ? discovered.join(", ") : "(none found)";
    throw new Error(
      `Unknown project: ${project}\n` +
        `Available projects: ${projectList}\n` +
        `Create directory: ${join(config.paths.projects_dir, project)}`,
    );
  }
}
