#!/usr/bin/env bun

import {
  init,
  add,
  update,
  use,
  remove,
  list,
  get,
  search,
  sync,
  push,
  check,
  status,
} from "./index";
import type { ResourceType } from "./lib/types";

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
kit - Cross-cutting component registry for the @voidwire ecosystem

USAGE:
  kit <command> [options]

COMMANDS:
  init [repo-url]           Initialize Kit — clone catalog repo, create directories
  add                       Register a new component in the catalog
  update <name>             Update metadata on an existing catalog entry
  use <name>                Install a component on this device
  remove <name>             Uninstall a component from this device
  list                      List catalog entries
  get <name>                Get full details for a component
  search <query>            Search components by keyword
  sync                      Pull latest catalog and update installed components
  push <name> [-m msg]      Push local changes back to source repo
  check                     Validate all catalog pointers against source repos
  status                    Show Kit status and installed components

OPTIONS:
  add:
    --name <name>           Component name (required)
    --repo <url>            Source repo URL (defaults to config source.repo)
    --path <path>           Path within repo (required)
    --type <type>           Resource type: skill|command|tool|agent (required)
    --domain <d1,d2>        Domain tags (comma-separated)
    --tags <t1,t2>          Tags (comma-separated)
    --description <text>    Description

  update:
    --domain <d1,d2>        Domain tags (comma-separated)
    --tags <t1,t2>          Tags (comma-separated)
    --description <text>    Description

  use:
    --dir <path>            Install to specific directory (project-scoped)

  remove:
    --from-catalog          Remove from catalog instead of local uninstall

  list:
    --installed             Only show installed components
    --available             Only show not-installed components
    --type <type>           Filter by resource type
    --domain <domain>       Filter by domain
    --tags <t1,t2>          Filter by tags (comma-separated)

RESOURCE TYPES:
  skill    → ~/.claude/skills/<name>/
  command  → ~/.claude/commands/<name>.md
  tool     → ~/.local/bin/
  agent    → ~/.claude/agents/<name>.md

EXAMPLES:
  kit init https://github.com/user/kit-catalog.git
  kit add --name recon-methodology --repo github.com/user/forge --path skills/recon --type skill --domain security,recon --tags recon,methodology
  kit use recon-methodology
  kit use recon-methodology --dir ./
  kit list --type skill --domain security
  kit search recon
  kit sync
  kit push recon-methodology
  kit status
`);
}

async function main(): Promise<void> {
  if (!command || hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case "init": {
      const repo = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
      const result = await init(repo);
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "add": {
      const name = getArg("--name");
      const repo = getArg("--repo");
      const path = getArg("--path");
      const type = getArg("--type") as ResourceType | undefined;
      const domainStr = getArg("--domain");
      const tagsStr = getArg("--tags");
      const description = getArg("--description");

      if (!name) fail("Missing --name");
      if (!path) fail("Missing --path");
      if (!type) fail("Missing --type");

      const result = await add({
        name,
        repo: repo || undefined,
        path,
        type,
        domain: domainStr ? domainStr.split(",") : undefined,
        tags: tagsStr ? tagsStr.split(",") : undefined,
        description,
      });
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "update": {
      const name = args[1];
      if (!name || name.startsWith("-"))
        fail(
          "Missing component name. Usage: kit update <name> [--domain d1,d2] [--tags t1,t2] [--description text]",
        );
      const domainStr = getArg("--domain");
      const tagsStr = getArg("--tags");
      const description = getArg("--description");

      if (!domainStr && !tagsStr && description === undefined) {
        fail(
          "No fields to update. Provide at least one of --domain, --tags, --description",
        );
      }

      const result = await update(name, {
        domain: domainStr ? domainStr.split(",") : undefined,
        tags: tagsStr ? tagsStr.split(",") : undefined,
        description,
      });
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "use": {
      const name = args[1];
      if (!name || name.startsWith("-"))
        fail("Missing component name. Usage: kit use <name>");
      const dir = getArg("--dir");
      const result = await use(name, dir);
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "remove": {
      const name = args[1];
      if (!name || name.startsWith("-"))
        fail("Missing component name. Usage: kit remove <name>");
      const fromCatalog = hasFlag("--from-catalog");
      const result = await remove(name, fromCatalog);
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "list": {
      const type = getArg("--type") as ResourceType | undefined;
      const domain = getArg("--domain");
      const tagsStr = getArg("--tags");
      const installed = hasFlag("--installed");
      const available = hasFlag("--available");

      const result = await list({
        type,
        domain,
        tags: tagsStr ? tagsStr.split(",") : undefined,
        installed,
        available,
      });
      respond(result);
      break;
    }

    case "get": {
      const name = args[1];
      if (!name || name.startsWith("-"))
        fail("Missing component name. Usage: kit get <name>");
      const result = await get(name);
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "search": {
      const query = args
        .slice(1)
        .filter((a) => !a.startsWith("-"))
        .join(" ");
      if (!query) fail("Missing search query. Usage: kit search <query>");
      const result = await search(query);
      respond(result);
      break;
    }

    case "sync": {
      const result = await sync();
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "push": {
      const name = args[1];
      if (!name || name.startsWith("-"))
        fail(
          "Missing component name. Usage: kit push <name> [-m message] [--force]",
        );
      const message = getArg("-m");
      const force = hasFlag("--force");
      const result = await push(name, message, force);
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "check": {
      const result = await check();
      respond(result);
      if (!result.success) process.exit(1);
      break;
    }

    case "status": {
      const result = await status();
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
