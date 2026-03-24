# @voidwire/kit

Cross-cutting component registry for the @voidwire ecosystem. Manages skills, agents, commands, and scripts across devices.

Kit is a **package manager without versioning** — "I just want the latest." It maintains a YAML catalog of pointers to components in git repos, with type-aware installation to the correct locations on disk.

## Quick Start

```bash
bun install -g @voidwire/kit

# Initialize with your catalog repo
kit init https://github.com/user/kit-catalog.git

# Browse what's available
kit list
kit list --type skill --domain security
kit search recon

# Install a component
kit use recon-methodology

# Keep everything up to date
kit sync
```

## Concepts

### Catalog

The catalog is a YAML file in its own git repo. It stores **references** — pointers to where components live, not the components themselves.

```yaml
# kit-catalog.yaml
skills:
  - name: recon-methodology
    repo: https://github.com/user/forge
    path: skills/recon-methodology
    type: skill
    domain: [security, reconnaissance]
    tags: [recon, methodology]
    description: Structured recon methodology skill
```

### Resource Types

| Type | Default Location | Notes |
|------|-----------------|-------|
| `skill` | `~/.claude/skills/<name>/` | Claude Code skill directories |
| `command` | `~/.claude/commands/<name>.md` | Claude Code slash commands |
| `script` | `~/.local/bin/` | Executable scripts |
| `agent` | `~/.config/sable/agents/` | Sable persona definitions |

### Two Views

- **Catalog** — everything registered (shared across devices via git)
- **Installed** — what's on this device (local state in `~/.local/share/kit/state.yaml`)

## CLI Reference

### `kit init [repo-url]`

Set up Kit: clone catalog repo, create XDG directories, initialize state.

```bash
kit init https://github.com/user/kit-catalog.git
```

### `kit add`

Register a new component in the catalog.

```bash
kit add \
  --name recon-methodology \
  --repo https://github.com/user/forge \
  --path skills/recon-methodology \
  --type skill \
  --domain security,recon \
  --tags recon,methodology \
  --description "Structured recon methodology"
```

### `kit use <name>`

Install a component on this device.

```bash
kit use recon-methodology              # global install
kit use recon-methodology --dir ./     # project-scoped install
```

### `kit remove <name>`

Uninstall from this device, or deregister from catalog.

```bash
kit remove recon-methodology                # local uninstall
kit remove recon-methodology --from-catalog # remove from catalog
```

### `kit list`

List catalog entries with filters.

```bash
kit list                              # all entries
kit list --installed                  # only installed
kit list --available                  # only not installed
kit list --type skill                 # filter by type
kit list --domain security            # filter by domain
kit list --tags recon,scan            # filter by tags
```

### `kit get <name>`

Full details for one component.

### `kit search <query>`

Keyword search across name, description, tags, domain, and type.

### `kit sync`

Pull latest catalog and update all installed components from their source repos.

### `kit push <name>`

Push local changes to an installed component back to its source repo.

### `kit status`

Show Kit initialization state and all installed components.

## Library API

Kit exports a programmatic API for use by other tools (Forge, Sable, etc.):

```typescript
import { list, get, search } from "@voidwire/kit";

// List all security skills
const skills = await list({ type: "skill", domain: "security" });

// Get details for a specific component
const entry = await get("recon-methodology");

// Search by keyword
const results = await search("recon");

// Only installed components
const installed = await list({ installed: true });
```

All functions return typed result objects with `success` boolean and relevant data.

### Available Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `init(repo?)` | `InitResult` | Initialize Kit |
| `add(opts)` | `AddResult` | Register component in catalog |
| `use(name, dir?)` | `UseResult` | Install component |
| `remove(name, fromCatalog?)` | `RemoveResult` | Uninstall/deregister |
| `list(opts?)` | `ListResult` | List with filters |
| `get(name)` | `GetResult` | Get single component |
| `search(query)` | `SearchResult` | Keyword search |
| `sync()` | `SyncResult` | Update catalog + installed |
| `push(name)` | `PushResult` | Push local changes |
| `status()` | `StatusResult` | Kit status |

## Configuration

`~/.config/kit/config.toml`:

```toml
[catalog]
repo = "https://github.com/user/kit-catalog.git"

[paths]
skills = "~/.claude/skills"
commands = "~/.claude/commands"
scripts = "~/.local/bin"
agents = "~/.config/sable/agents"
```

## XDG Paths

| Purpose | Path |
|---------|------|
| Config | `~/.config/kit/` |
| State | `~/.local/share/kit/` |
| Cache | `~/.cache/kit/` |

## Integration

### Forge

Forge planner queries Kit to discover available security components:

```typescript
import { list } from "@voidwire/kit";
const reconSkills = await list({ type: "skill", domain: "security", tags: ["recon"] });
```

### Sable

Sable could query Kit at session start for skill/agent discovery:

```typescript
import { list } from "@voidwire/kit";
const agents = await list({ type: "agent", installed: true });
```

### TARS/OpenClaw

Query Kit before spawning agents to find the right skill:

```bash
kit list --type skill --domain security --tags recon
```

## Workflow

1. **Build** a skill/agent/command in its source project repo
2. **Catalog** with `kit add` — registers a reference
3. **Distribute** with `kit use` on any device — installs to correct location
4. **Use** the component
5. **Update** with `kit push` — pushes local changes back
6. **Sync** with `kit sync` — pulls latest everywhere
