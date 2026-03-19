import {
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "fs";
import { getConfig } from "./config";
import type { DomainState, LearningContext } from "./types";

function domainsDir(): string {
  const config = getConfig();
  return `${config.paths.data}/domains`;
}

function domainPath(name: string): string {
  return `${domainsDir()}/${name}.json`;
}

export function domainExists(name: string): boolean {
  return existsSync(domainPath(name));
}

export function validateDomainState(raw: unknown): DomainState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid domain state: not an object");
  }
  const obj = raw as Record<string, unknown>;

  // Validate required top-level fields
  if (typeof obj.domain !== "string")
    throw new Error("Invalid domain state: missing or invalid 'domain' field");
  if (typeof obj.goal !== "string")
    throw new Error("Invalid domain state: missing or invalid 'goal' field");
  if (typeof obj.context !== "string")
    throw new Error("Invalid domain state: missing or invalid 'context' field");
  if (typeof obj.persona !== "string")
    throw new Error("Invalid domain state: missing or invalid 'persona' field");
  if (typeof obj.session_count !== "number")
    throw new Error(
      "Invalid domain state: missing or invalid 'session_count' field",
    );
  if (!Array.isArray(obj.session_history))
    throw new Error(
      "Invalid domain state: missing or invalid 'session_history' field",
    );
  if (typeof obj.progress !== "object" || obj.progress === null)
    throw new Error(
      "Invalid domain state: missing or invalid 'progress' field",
    );
  if (typeof obj.curriculum !== "object" || obj.curriculum === null)
    throw new Error(
      "Invalid domain state: missing or invalid 'curriculum' field",
    );

  // Validate nested structures
  const curriculum = obj.curriculum as Record<string, unknown>;
  if (!Array.isArray(curriculum.concepts))
    throw new Error(
      "Invalid domain state: curriculum.concepts must be an array",
    );

  if (!Array.isArray(obj.sources))
    throw new Error("Invalid domain state: sources must be an array");

  const progress = obj.progress as Record<string, unknown>;
  for (const [conceptId, entry] of Object.entries(progress)) {
    if (typeof entry !== "object" || entry === null)
      throw new Error(
        `Invalid domain state: progress['${conceptId}'] must be an object`,
      );
    const p = entry as Record<string, unknown>;
    if (typeof p.fsrs_card !== "object" || p.fsrs_card === null)
      throw new Error(
        `Invalid domain state: progress['${conceptId}'].fsrs_card must be an object`,
      );
    if (typeof p.mastery !== "string")
      throw new Error(
        `Invalid domain state: progress['${conceptId}'].mastery must be a string`,
      );
  }

  return raw as DomainState;
}

export function readDomain(name: string): DomainState {
  const path = domainPath(name);
  if (!existsSync(path)) {
    throw new Error(`Domain '${name}' not found`);
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read domain '${name}': ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse domain '${name}': ${msg}`);
  }

  return validateDomainState(parsed);
}

export function writeDomain(state: DomainState): void {
  const dir = domainsDir();
  mkdirSync(dir, { recursive: true });

  const path = domainPath(state.domain);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, path);
}

export function listDomains(): string[] {
  const dir = domainsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function initDomain(
  name: string,
  goal: string,
  context: LearningContext,
  persona: string,
): DomainState {
  if (domainExists(name)) {
    throw new Error(
      `Domain '${name}' already exists. Use 'dojo domain update' to modify.`,
    );
  }

  const state: DomainState = {
    domain: name,
    goal,
    context,
    persona,
    sources: [],
    curriculum: {
      concepts: [],
      generated_from: "model-knowledge",
      generated_at: new Date().toISOString(),
    },
    progress: {},
    session_history: [],
    session_count: 0,
    last_session: null,
  };

  writeDomain(state);
  return state;
}

export function updateDomain(
  name: string,
  fields: Partial<Pick<DomainState, "goal" | "context" | "persona">>,
): DomainState {
  const state = readDomain(name);

  if (fields.goal !== undefined) state.goal = fields.goal;
  if (fields.context !== undefined) state.context = fields.context;
  if (fields.persona !== undefined) state.persona = fields.persona;

  writeDomain(state);
  return state;
}
