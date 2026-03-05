#!/usr/bin/env bun

import {
  initDomain,
  readDomain,
  listDomains,
  updateDomain,
  recordSession,
  getSessionStatus,
  addConcept,
  setConceptResources,
  validateCurriculum,
  verifyUrls,
  updateProgress,
  getDueConcepts,
  getReadyConcepts,
  addConfusionPair,
  getNudgeStatus,
  type LearningContext,
  type FSRSRating,
  type MasteryLevel,
  type Resource,
} from "./index";

// ============================================================================
// Argument Parsing (from Lore pattern)
// ============================================================================

function parseArgs(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        parsed.set(k, v);
        i++;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed.set(key, args[i + 1]);
        i += 2;
      } else {
        parsed.set(key, "true");
        i++;
      }
    } else {
      i++;
    }
  }

  return parsed;
}

const BOOLEAN_FLAGS = new Set(["help"]);

function getPositionalArgs(args: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const flag = arg.slice(2).split("=")[0];
      if (BOOLEAN_FLAGS.has(flag) || arg.includes("=")) {
        i += 1;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    result.push(arg);
    i++;
  }
  return result;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`) || args.includes(`-${flag.charAt(0)}`);
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

// ============================================================================
// Output Helpers
// ============================================================================

interface OutputResult {
  success: boolean;
  [key: string]: unknown;
}

function output(result: OutputResult): void {
  console.log(JSON.stringify(result, null, 2));
}

function fail(error: string, code: number = 1): never {
  output({ success: false, error });
  process.exit(code);
}

// ============================================================================
// Valid values
// ============================================================================

const VALID_CONTEXTS: LearningContext[] = [
  "sprint",
  "skill-build",
  "problem-solve",
  "deep-mastery",
];

// ============================================================================
// Domain Command
// ============================================================================

function showDomainHelp(): void {
  console.log(`
dojo domain - Manage learning domains

Usage:
  dojo domain init <name> --goal "..." --context <ctx> --persona <name>
  dojo domain get <name>
  dojo domain list
  dojo domain update <name> [--goal "..."] [--context <ctx>] [--persona <name>]

Contexts: sprint, skill-build, problem-solve, deep-mastery
`);
  process.exit(0);
}

function handleDomain(args: string[]): void {
  if (args.length === 0 || hasFlag(args, "help")) {
    showDomainHelp();
  }

  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case "init": {
      const positional = getPositionalArgs(subArgs);
      const flags = parseArgs(subArgs);
      const name = positional[0];
      if (!name)
        fail(
          "Missing domain name. Usage: dojo domain init <name> --goal '...' --context <ctx> --persona <name>",
        );

      const goal = flags.get("goal");
      if (!goal) fail("Missing required flag: --goal");

      const context = flags.get("context") as LearningContext | undefined;
      if (!context) fail("Missing required flag: --context");
      if (!VALID_CONTEXTS.includes(context))
        fail(
          `Invalid context: ${context}. Valid: ${VALID_CONTEXTS.join(", ")}`,
        );

      const persona = flags.get("persona");
      if (!persona) fail("Missing required flag: --persona");

      try {
        const state = initDomain(name, goal, context, persona);
        output({ success: true, data: state });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "get": {
      const positional = getPositionalArgs(subArgs);
      const name = positional[0];
      if (!name) fail("Missing domain name. Usage: dojo domain get <name>");

      try {
        const state = readDomain(name);
        output({ success: true, data: state });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "list": {
      try {
        const names = listDomains();
        output({ success: true, data: names });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "update": {
      const positional = getPositionalArgs(subArgs);
      const flags = parseArgs(subArgs);
      const name = positional[0];
      if (!name)
        fail(
          "Missing domain name. Usage: dojo domain update <name> [--goal '...'] [--context <ctx>] [--persona <name>]",
        );

      const goal = flags.get("goal");
      const context = flags.get("context");
      const persona = flags.get("persona");

      if (!goal && !context && !persona) {
        fail("At least one of --goal, --context, or --persona is required");
      }

      if (context && !VALID_CONTEXTS.includes(context as LearningContext)) {
        fail(
          `Invalid context: ${context}. Valid: ${VALID_CONTEXTS.join(", ")}`,
        );
      }

      try {
        const state = updateDomain(name, {
          ...(goal !== undefined && { goal }),
          ...(context !== undefined && {
            context: context as LearningContext,
          }),
          ...(persona !== undefined && { persona }),
        });
        output({ success: true, data: state });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    default:
      fail(`Unknown domain subcommand: ${sub}. Use: init, get, list, update`);
  }
}

// ============================================================================
// Session Command
// ============================================================================

function showSessionHelp(): void {
  console.log(`
dojo session - Session management

Usage:
  dojo session record <domain> --data '{...}'
  dojo session status [domain]

Record data JSON fields:
  concepts_covered (required): string[]
  calibration (required): "too-easy" | "right" | "too-hard"
  duration_minutes (required): number
  persona (required): string
  context (required): string
  confusion_pairs_encountered: string[]
  resources_suggested: Resource[]
  resources_used: string[]
  breakthrough_moments: string[]
  struggle_descriptions: string[]
`);
  process.exit(0);
}

function handleSession(args: string[]): void {
  if (args.length === 0 || hasFlag(args, "help")) {
    showSessionHelp();
  }

  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case "record": {
      const positional = getPositionalArgs(subArgs);
      const flags = parseArgs(subArgs);
      const domain = positional[0];
      if (!domain)
        fail(
          "Missing domain name. Usage: dojo session record <domain> --data '{...}'",
        );

      const dataStr = flags.get("data");
      if (!dataStr) fail("Missing required flag: --data");

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataStr);
      } catch {
        fail("Invalid JSON in --data flag");
      }

      // Validate required fields
      if (!Array.isArray(data.concepts_covered))
        fail("--data must include 'concepts_covered' (string[])");
      if (!data.calibration) fail("--data must include 'calibration'");
      if (typeof data.duration_minutes !== "number")
        fail("--data must include 'duration_minutes' (number)");
      if (!data.persona) fail("--data must include 'persona'");
      if (!data.context) fail("--data must include 'context'");

      try {
        recordSession(domain, data as Parameters<typeof recordSession>[1]);
        output({ success: true });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "status": {
      const positional = getPositionalArgs(subArgs);
      const domain = positional[0]; // optional

      try {
        const status = getSessionStatus(domain);
        output({ success: true, ...status });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    default:
      fail(`Unknown session subcommand: ${sub}. Use: record, status`);
  }
}

// ============================================================================
// Curriculum Command
// ============================================================================

const VALID_RATINGS: FSRSRating[] = ["again", "hard", "good", "easy"];
const VALID_MASTERY: MasteryLevel[] = [
  "none",
  "introduced",
  "practiced",
  "reinforced",
  "solid",
];

function showCurriculumHelp(): void {
  console.log(`
dojo curriculum - Curriculum graph operations

Usage:
  dojo curriculum add-concept <domain> --id "..." --title "..." --prereqs '[...]' --difficulty <1-5> [--description "..."]
  dojo curriculum set-resources <domain> <concept-id> --resources '[{...}]'
  dojo curriculum validate <domain>
  dojo curriculum verify-urls <domain>
`);
  process.exit(0);
}

async function handleCurriculum(args: string[]): Promise<void> {
  if (args.length === 0 || hasFlag(args, "help")) {
    showCurriculumHelp();
  }

  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case "add-concept": {
      const positional = getPositionalArgs(subArgs);
      const flags = parseArgs(subArgs);
      const domain = positional[0];
      if (!domain)
        fail(
          "Missing domain name. Usage: dojo curriculum add-concept <domain> --id '...' --title '...' --prereqs '[...]' --difficulty <1-5>",
        );

      const id = flags.get("id");
      if (!id) fail("Missing required flag: --id");

      const title = flags.get("title");
      if (!title) fail("Missing required flag: --title");

      const prereqsStr = flags.get("prereqs");
      if (prereqsStr === undefined) fail("Missing required flag: --prereqs");

      let prereqs: string[];
      try {
        prereqs = JSON.parse(prereqsStr);
        if (!Array.isArray(prereqs))
          fail("--prereqs must be a JSON array, e.g. '[\"a\"]'");
      } catch {
        fail("--prereqs must be a JSON array, e.g. '[\"a\"]'");
      }

      const difficultyStr = flags.get("difficulty");
      if (!difficultyStr) fail("Missing required flag: --difficulty");
      const difficulty = Number(difficultyStr);
      if (isNaN(difficulty) || difficulty < 1 || difficulty > 5)
        fail("--difficulty must be a number between 1 and 5");

      const description = flags.get("description");

      try {
        const state = addConcept(domain, {
          id,
          title,
          description,
          prereqs,
          difficulty,
        });
        output({ success: true, data: state });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "set-resources": {
      const positional = getPositionalArgs(subArgs);
      const flags = parseArgs(subArgs);
      const domain = positional[0];
      const conceptId = positional[1];
      if (!domain || !conceptId)
        fail(
          "Usage: dojo curriculum set-resources <domain> <concept-id> --resources '[{...}]'",
        );

      const resourcesStr = flags.get("resources");
      if (!resourcesStr) fail("Missing required flag: --resources");

      let resources: Resource[];
      try {
        resources = JSON.parse(resourcesStr);
        if (!Array.isArray(resources))
          fail("--resources must be a JSON array of Resource objects");
      } catch {
        fail("--resources must be a JSON array of Resource objects");
      }

      try {
        const state = setConceptResources(domain, conceptId, resources);
        output({ success: true, data: state });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "validate": {
      const positional = getPositionalArgs(subArgs);
      const domain = positional[0];
      if (!domain)
        fail("Missing domain name. Usage: dojo curriculum validate <domain>");

      try {
        const result = validateCurriculum(domain);
        output({ success: true, data: result });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "verify-urls": {
      const positional = getPositionalArgs(subArgs);
      const domain = positional[0];
      if (!domain)
        fail(
          "Missing domain name. Usage: dojo curriculum verify-urls <domain>",
        );

      try {
        const result = await verifyUrls(domain);
        output({ success: true, data: result });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    default:
      fail(
        `Unknown curriculum subcommand: ${sub}. Use: add-concept, set-resources, validate, verify-urls`,
      );
  }
}

// ============================================================================
// Progress Command
// ============================================================================

function showProgressHelp(): void {
  console.log(`
dojo progress - FSRS progress tracking

Usage:
  dojo progress update <domain> <concept-id> --rating <again|hard|good|easy> [--mastery <level>]
  dojo progress get-due <domain>
  dojo progress get-ready <domain>
  dojo progress add-confusion <domain> <concept-a> <concept-b>

Mastery levels: none, introduced, practiced, reinforced, solid
`);
  process.exit(0);
}

function handleProgress(args: string[]): void {
  if (args.length === 0 || hasFlag(args, "help")) {
    showProgressHelp();
  }

  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case "update": {
      const positional = getPositionalArgs(subArgs);
      const flags = parseArgs(subArgs);
      const domain = positional[0];
      const conceptId = positional[1];
      if (!domain || !conceptId)
        fail(
          "Usage: dojo progress update <domain> <concept-id> --rating <again|hard|good|easy>",
        );

      const rating = flags.get("rating") as FSRSRating | undefined;
      if (!rating) fail("Missing required flag: --rating");
      if (!VALID_RATINGS.includes(rating))
        fail(`Invalid rating: '${rating}'. Use: ${VALID_RATINGS.join(", ")}`);

      const mastery = flags.get("mastery") as MasteryLevel | undefined;
      if (mastery && !VALID_MASTERY.includes(mastery))
        fail(`Invalid mastery: '${mastery}'. Use: ${VALID_MASTERY.join(", ")}`);

      try {
        const result = updateProgress(domain, conceptId, rating, mastery);
        output({ success: true, data: result });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "get-due": {
      const positional = getPositionalArgs(subArgs);
      const domain = positional[0];
      if (!domain)
        fail("Missing domain name. Usage: dojo progress get-due <domain>");

      try {
        const result = getDueConcepts(domain);
        output({ success: true, data: result });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "get-ready": {
      const positional = getPositionalArgs(subArgs);
      const domain = positional[0];
      if (!domain)
        fail("Missing domain name. Usage: dojo progress get-ready <domain>");

      try {
        const result = getReadyConcepts(domain);
        output({ success: true, data: result });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "add-confusion": {
      const positional = getPositionalArgs(subArgs);
      const domain = positional[0];
      const conceptA = positional[1];
      const conceptB = positional[2];
      if (!domain || !conceptA || !conceptB)
        fail(
          "Usage: dojo progress add-confusion <domain> <concept-a> <concept-b>",
        );

      try {
        const state = addConfusionPair(domain, conceptA, conceptB);
        output({ success: true, data: state });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    default:
      fail(
        `Unknown progress subcommand: ${sub}. Use: update, get-due, get-ready, add-confusion`,
      );
  }
}

// ============================================================================
// Nudge Command
// ============================================================================

function handleNudge(_args: string[]): void {
  try {
    const status = getNudgeStatus();
    output({ success: true, data: status });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

// ============================================================================
// Global Help
// ============================================================================

function showHelp(): void {
  console.log(`
dojo - Coaching system state management CLI

Usage:
  dojo domain <subcommand>     Manage learning domains
  dojo curriculum <subcommand> Curriculum graph operations
  dojo progress <subcommand>   FSRS progress tracking
  dojo session <subcommand>    Session management
  dojo nudge                   Check for stale domains

Run 'dojo <command> --help' for command-specific help.
`);
  process.exit(0);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case "domain":
        handleDomain(commandArgs);
        break;
      case "curriculum":
        await handleCurriculum(commandArgs);
        break;
      case "progress":
        handleProgress(commandArgs);
        break;
      case "session":
        handleSession(commandArgs);
        break;
      case "nudge":
        handleNudge(commandArgs);
        break;
      default:
        fail(
          `Unknown command: ${command}. Use: domain, curriculum, progress, session, nudge`,
        );
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
