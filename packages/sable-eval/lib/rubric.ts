/**
 * lib/rubric.ts - Rubric loader and validator
 *
 * Reads YAML rubric files, parses them into typed RubricConfig,
 * and validates required fields and weight constraints.
 *
 * Bare name resolution (e.g., "task-plan-quality"):
 * Resolves from SABLE_DATA/rubrics/{name}.yaml
 * SABLE_DATA comes from env var, falls back to ~/.local/share/sable
 */

import { load as loadYaml } from "js-yaml";
import { homedir } from "os";
import { join, isAbsolute } from "path";
import type { RubricConfig, Criterion } from "./types";

const WEIGHT_TOLERANCE = 0.01;

function getSableData(): string {
  return process.env.SABLE_DATA || join(homedir(), ".local", "share", "sable");
}

/**
 * Resolve a rubric path from a name or path.
 *
 * - Absolute path or starts with "./" — use as-is
 * - Bare name — resolve from SABLE_DATA/rubrics/
 */
async function resolveRubricPath(nameOrPath: string): Promise<string> {
  // Absolute path or relative path — use directly
  if (
    isAbsolute(nameOrPath) ||
    nameOrPath.startsWith("./") ||
    nameOrPath.startsWith("../")
  ) {
    return nameOrPath;
  }

  // If it looks like a file path with extension, use directly
  if (nameOrPath.endsWith(".yaml") || nameOrPath.endsWith(".yml")) {
    return nameOrPath;
  }

  // Bare name — resolve from SABLE_DATA
  const name = nameOrPath;
  const sableData = getSableData();
  const rubricPath = join(sableData, "rubrics", `${name}.yaml`);

  const rubricFile = Bun.file(rubricPath);
  if (await rubricFile.exists()) {
    return rubricPath;
  }

  throw new Error(
    `Rubric "${name}" not found at: ${rubricPath}\n\n` +
      `Rubrics are installed by install.sh to SABLE_DATA/rubrics/.\n` +
      `SABLE_DATA=${sableData}\n` +
      `Or pass an absolute path to a rubric YAML file.`,
  );
}

/**
 * Validate a parsed rubric object has all required fields.
 */
function validateRubric(raw: unknown): RubricConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Rubric must be a YAML object");
  }

  const obj = raw as Record<string, unknown>;

  // Validate name
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    throw new Error("Rubric must have a non-empty 'name' field");
  }

  // Validate passThreshold
  if (
    typeof obj.passThreshold !== "number" ||
    obj.passThreshold < 0 ||
    obj.passThreshold > 1
  ) {
    throw new Error(
      `Rubric 'passThreshold' must be a number between 0 and 1, got: ${obj.passThreshold}`,
    );
  }

  // Validate criteria
  if (!Array.isArray(obj.criteria) || obj.criteria.length === 0) {
    throw new Error("Rubric must have a non-empty 'criteria' array");
  }

  const criteria: Criterion[] = [];
  let weightSum = 0;

  for (let i = 0; i < obj.criteria.length; i++) {
    const c = obj.criteria[i] as Record<string, unknown>;
    const prefix = `criteria[${i}]`;

    if (typeof c.name !== "string" || c.name.length === 0) {
      throw new Error(`${prefix} must have a non-empty 'name'`);
    }
    if (typeof c.weight !== "number" || c.weight <= 0 || c.weight > 1) {
      throw new Error(
        `${prefix} 'weight' must be a number between 0 and 1, got: ${c.weight}`,
      );
    }
    if (typeof c.description !== "string" || c.description.length === 0) {
      throw new Error(`${prefix} must have a non-empty 'description'`);
    }

    const examples = c.examples as Record<string, unknown> | undefined;
    if (!examples || typeof examples !== "object") {
      throw new Error(
        `${prefix} must have an 'examples' object with 'good' and 'bad' strings`,
      );
    }
    if (typeof examples.good !== "string" || examples.good.length === 0) {
      throw new Error(`${prefix}.examples must have a non-empty 'good' string`);
    }
    if (typeof examples.bad !== "string" || examples.bad.length === 0) {
      throw new Error(`${prefix}.examples must have a non-empty 'bad' string`);
    }

    weightSum += c.weight;

    criteria.push({
      name: c.name,
      weight: c.weight,
      description: c.description,
      examples: {
        good: examples.good as string,
        bad: examples.bad as string,
      },
    });
  }

  // Validate weights sum to 1.0
  if (Math.abs(weightSum - 1.0) > WEIGHT_TOLERANCE) {
    throw new Error(
      `Criteria weights must sum to 1.0 (within ${WEIGHT_TOLERANCE} tolerance), got: ${weightSum.toFixed(4)}`,
    );
  }

  return {
    name: obj.name,
    passThreshold: obj.passThreshold,
    criteria,
  };
}

/**
 * Load and validate a rubric from a name or path.
 *
 * @param nameOrPath - Bare name (e.g., "task-plan-quality"), relative path, or absolute path
 * @returns Validated RubricConfig
 * @throws Error on missing file, invalid YAML, or validation failure
 */
export async function loadRubric(nameOrPath: string): Promise<RubricConfig> {
  const resolvedPath = await resolveRubricPath(nameOrPath);

  const file = Bun.file(resolvedPath);
  if (!(await file.exists())) {
    throw new Error(`Rubric file not found: ${resolvedPath}`);
  }

  const text = await file.text();
  const raw = loadYaml(text);

  return validateRubric(raw);
}
