import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_CONFIG = `[paths]
data = "~/.local/share/dojo"
cache = "~/.cache/dojo"

[fsrs]
request_retention = 0.9
maximum_interval = 36500
enable_fuzz = true
learning_steps = ["1m", "10m"]
relearning_steps = ["10m"]

[session]
target_duration_minutes = 15
concepts_per_session = 3
staleness_threshold_days = 7

[lore]
capture_on_exit = true
`;

function copyDirSync(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

export function handleInit(
  _args: string[],
  output: (result: { success: boolean; [key: string]: unknown }) => void,
  fail: (error: string, code?: number) => never,
): void {
  const home = homedir();
  const warnings: string[] = [];

  // Step 1: Check yt-dlp (warn if missing)
  const ytdlpFound = Bun.which("yt-dlp") !== null;
  if (!ytdlpFound) {
    warnings.push(
      "yt-dlp not found — video source ingestion won't work. Install: pip install yt-dlp",
    );
  }

  // Step 2: Check Lore CLI (warn if missing)
  const loreFound = Bun.which("lore") !== null;
  if (!loreFound) {
    warnings.push("lore not found — session captures to Lore won't work");
  }

  // Step 3: Create XDG directories
  const dirs = [
    `${home}/.config/dojo`,
    `${home}/.local/share/dojo/domains`,
    `${home}/.local/share/dojo/sources`,
    `${home}/.cache/dojo`,
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  // Step 4: Config.toml — create or preserve
  const configPath = `${home}/.config/dojo/config.toml`;
  let configStatus: "created" | "preserved";

  if (existsSync(configPath)) {
    configStatus = "preserved";
  } else {
    writeFileSync(configPath, DEFAULT_CONFIG);
    configStatus = "created";
  }

  // Step 5: Copy skill files to ~/.claude/skills/learn/
  const packageDir = import.meta.dir.replace(/\/lib$/, "");
  const skillSrc = `${packageDir}/skills/learn`;
  const skillDst = `${home}/.claude/skills/learn`;

  if (!existsSync(skillSrc)) {
    return fail("Skill source not found — package may be incomplete");
  }

  mkdirSync(skillDst, { recursive: true });
  copyDirSync(skillSrc, skillDst);

  // Step 6: Verify installation
  const checks = {
    config: existsSync(configPath),
    data_dir: existsSync(`${home}/.local/share/dojo/domains`),
    cache_dir: existsSync(`${home}/.cache/dojo`),
    skill_files: existsSync(`${skillDst}/SKILL.md`),
  };

  // Step 7: Return JSON result
  output({
    success: true,
    data: {
      config: { path: configPath, status: configStatus },
      directories: dirs,
      skills: { source: skillSrc, destination: skillDst, status: "copied" },
      dependencies: { yt_dlp: ytdlpFound, lore: loreFound },
      warnings,
      checks,
    },
  });
}
