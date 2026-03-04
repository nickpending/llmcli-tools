import { readFileSync } from "fs";
import { homedir } from "os";
import { parse as parseToml } from "@iarna/toml";

export interface DojoConfig {
  paths: {
    data: string;
    cache: string;
  };
  fsrs: {
    request_retention: number;
    maximum_interval: number;
    enable_fuzz: boolean;
    learning_steps: string[];
    relearning_steps: string[];
  };
  session: {
    target_duration_minutes: number;
    concepts_per_session: number;
    staleness_threshold_days: number;
  };
  lore: {
    capture_on_exit: boolean;
  };
}

let cachedConfig: DojoConfig | null = null;

function resolvePath(p: string): string {
  return p.replace(/^~/, homedir());
}

export function getConfig(): DojoConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = `${homedir()}/.config/dojo/config.toml`;
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(
      `Config not found: ${configPath}\nRun ./install.sh to create it.`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config.toml: ${msg}`);
  }

  const paths = parsed.paths as Record<string, unknown> | undefined;
  const fsrs = parsed.fsrs as Record<string, unknown> | undefined;
  const session = parsed.session as Record<string, unknown> | undefined;
  const lore = parsed.lore as Record<string, unknown> | undefined;

  if (!paths?.data || !paths?.cache)
    throw new Error("config.toml: [paths] must have data and cache");
  if (!fsrs) throw new Error("config.toml: missing [fsrs] section");
  if (!session) throw new Error("config.toml: missing [session] section");

  cachedConfig = {
    paths: {
      data: resolvePath(paths.data as string),
      cache: resolvePath(paths.cache as string),
    },
    fsrs: {
      request_retention: (fsrs.request_retention as number) ?? 0.9,
      maximum_interval: (fsrs.maximum_interval as number) ?? 36500,
      enable_fuzz: (fsrs.enable_fuzz as boolean) ?? true,
      learning_steps: (fsrs.learning_steps as string[]) ?? ["1m", "10m"],
      relearning_steps: (fsrs.relearning_steps as string[]) ?? ["10m"],
    },
    session: {
      target_duration_minutes:
        (session.target_duration_minutes as number) ?? 15,
      concepts_per_session: (session.concepts_per_session as number) ?? 3,
      staleness_threshold_days:
        (session.staleness_threshold_days as number) ?? 7,
    },
    lore: {
      capture_on_exit: (lore?.capture_on_exit as boolean) ?? true,
    },
  };

  return cachedConfig!;
}
