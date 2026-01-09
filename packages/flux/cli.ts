#!/usr/bin/env bun

import {
  add,
  done,
  cancel,
  activate,
  defer,
  list,
  recurring,
  lint,
  archive,
  type ItemType,
} from "./index";

const args = process.argv.slice(2);
const command = args[0];

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 && idx < args.length - 1 ? args[idx + 1] : undefined;
}

function respond<T>(data: T): void {
  console.log(JSON.stringify(data, null, 2));
}

function fail(error: string): never {
  console.error(JSON.stringify({ success: false, error }));
  process.exit(1);
}

function showHelp(): void {
  console.log(`
flux - Task management CLI for Obsidian-based workflows

USAGE:
  flux <command> [options]

SCOPING:
  All commands support -p/--project to scope to a specific project.
  Without -p, commands operate on global items only.

COMMANDS:
  add <text>              Add a new item
  done <id|query>         Mark item as completed
  cancel <id|query>       Cancel an item
  activate <id|query>     Move item to active.md
  defer <id|query>        Move item from active back to backlog
  list                    List items (active by default)
  recurring               Surface due recurring items
  lint                    Check files for format issues
  archive                 Archive old completed items

OPTIONS:
  Common:
    --project, -p <name>  Scope to project (all commands)

  add:
    --type, -t <type>     Item type: todo, bug, idea (default: todo)
    --urgent, -u          Also add to active.md ## Today

  activate:
    --week, -w            Add to "This Week" instead of "Today"

  list:
    --backlog, -b         Show backlog instead of active
    --complete, -c        Show completed items
    --type, -t <type>     Filter by type

  recurring:
    --dry-run             Show what would be surfaced without doing it

  lint:
    --fix                 Auto-fix issues
    <path>                Specific file to lint

  archive:
    --dry-run             Show what would be archived without doing it

EXAMPLES:
  flux add "implement auth middleware" -p momentum
  flux add "fix login bug" -p momentum -t bug --urgent
  flux done a3f2d1
  flux done a3f2d1 -p momentum
  flux activate a3f2d1 -p momentum
  flux activate a3f2d1 --week
  flux defer a3f2d1
  flux list                        # global active items
  flux list -p momentum            # momentum's active items
  flux list -b                     # global backlog
  flux list -b -p momentum         # momentum's backlog
  flux list -c                     # today's completed
  flux list -c -p momentum         # momentum's completed
  flux recurring --dry-run
  flux lint --fix
  flux archive --dry-run
`);
}

async function main(): Promise<void> {
  if (!command || hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case "add": {
      const project = getArg("--project") ?? getArg("-p");
      const typeArg = getArg("--type") ?? getArg("-t");
      const type = typeArg as ItemType | undefined;
      const urgent = hasFlag("--urgent") || hasFlag("-u");

      // Build set of indices to skip (flags and their values)
      const skipIndices = new Set<number>();
      const flagsWithValues = ["--project", "-p", "--type", "-t"];
      const flagsWithoutValues = ["--urgent", "-u"];

      for (let i = 1; i < args.length; i++) {
        if (flagsWithValues.includes(args[i])) {
          skipIndices.add(i);
          skipIndices.add(i + 1);
        } else if (flagsWithoutValues.includes(args[i])) {
          skipIndices.add(i);
        }
      }

      const text = args
        .slice(1)
        .filter((_, i) => !skipIndices.has(i + 1))
        .join(" ");

      if (!text) {
        fail("Missing item text. Usage: flux add <text>");
      }

      const result = await add({ text, project, type, urgent });
      respond(result);
      break;
    }

    case "done": {
      const query = args[1];
      if (!query) {
        fail("Missing item ID or query. Usage: flux done <id|query>");
      }
      const project = getArg("--project") ?? getArg("-p");
      const result = await done(query, { project });
      respond(result);
      break;
    }

    case "cancel": {
      const query = args[1];
      if (!query) {
        fail("Missing item ID or query. Usage: flux cancel <id|query>");
      }
      const project = getArg("--project") ?? getArg("-p");
      const result = await cancel(query, { project });
      respond(result);
      break;
    }

    case "activate": {
      const query = args[1];
      if (!query) {
        fail("Missing item ID or query. Usage: flux activate <id|query>");
      }
      const week = hasFlag("--week") || hasFlag("-w");
      const project = getArg("--project") ?? getArg("-p");
      const result = await activate(query, { week, project });
      respond(result);
      break;
    }

    case "defer": {
      const query = args[1];
      if (!query) {
        fail("Missing item ID or query. Usage: flux defer <id|query>");
      }
      const project = getArg("--project") ?? getArg("-p");
      const result = await defer(query, { project });
      respond(result);
      break;
    }

    case "list": {
      const project = getArg("--project") ?? getArg("-p");
      const typeArg = getArg("--type") ?? getArg("-t");
      const type = typeArg as ItemType | undefined;
      const backlog = hasFlag("--backlog") || hasFlag("-b");
      const complete = hasFlag("--complete") || hasFlag("-c");
      const result = await list({ project, type, backlog, complete });
      respond(result);
      break;
    }

    case "recurring": {
      const dryRun = hasFlag("--dry-run");
      const result = await recurring(dryRun);
      respond(result);
      break;
    }

    case "lint": {
      const fix = hasFlag("--fix");
      const pathArg = args.find((a) => !a.startsWith("-") && a !== "lint");
      const result = await lint(pathArg, fix);
      respond(result);
      if (!result.success && !fix) {
        process.exit(1);
      }
      break;
    }

    case "archive": {
      const dryRun = hasFlag("--dry-run");
      const result = await archive(dryRun);
      respond(result);
      break;
    }

    default:
      fail(`Unknown command: ${command}. Use --help for usage.`);
  }
}

main().catch((err: Error) => {
  fail(err.message);
});
