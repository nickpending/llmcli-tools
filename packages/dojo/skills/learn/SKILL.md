---
name: learn
description: AI-powered coaching for any learning domain. USE WHEN user wants to learn something, start a study session, set up a new domain, check progress, or get a learning nudge.
argument-hint: [domain]
---

# Learn

Guide users through learning any domain using spaced repetition, curated curricula, and persona-driven coaching.

## Domain Staleness

!`dojo nudge 2>/dev/null`

## Data Locations

**State:** `~/.local/share/dojo/domains/{name}.json` — domain config, curriculum, progress, session history
**Config:** `~/.config/dojo/config.toml` — FSRS parameters, session defaults
**Skills:** `~/.claude/skills/learn/` — this skill, workflows, personas

## Determine Action

**From user's message, identify:**

| Intent / Keywords | Action |
|-------------------|--------|
| setup, new domain, start learning, "teach me", "I want to learn" | Read and follow `workflows/setup.md` |
| status, progress, overview, how am I doing | Read and follow `workflows/status.md` |
| session, learn, practice, review, continue | Follow **Session: Spawn Coaching Instance** below |

For setup and status intents: read the workflow file from this skill's directory and follow its instructions exactly.

For session intent: follow the procedure below.

---

## Session: Spawn Coaching Instance

When the user wants to start a coaching session (session, learn, practice, review, continue), follow these steps in order.

### Step 1: Determine Domain

Extract the domain name from the user's message. If the user mentions a domain, use it. If not (e.g., "let's practice"), check if the user has exactly one domain:

```bash
dojo domain list
```

If exactly one domain exists, use it. If multiple domains exist and none was named, ask the user which domain they want to practice.

### Step 2: Spawn

Run `dojo session spawn <domain>` with the domain name (or partial name — the CLI does fuzzy matching):

```bash
dojo session spawn <domain>
```

The CLI handles everything: reads the persona, assembles the coaching prompt, writes the spawn script, and opens a new terminal window with the coaching session.

If the command fails, show the user the error message from the CLI output.

### Step 3: Confirm

Tell the user: "Opening coaching session for **[domain]**. A new window will open with your session."

If the spawn result shows `"spawnMethod": "script-only"`, the CLI could not open a terminal window. Show the user the script path so they can run it manually:

"Could not open a terminal window automatically. Run the session manually: `bash /tmp/dojo-spawn-<domain>.sh`"

---

## Personas

11 teaching personas available in `personas/`. Each persona is assigned during domain setup. The session handler reads the assigned persona automatically — do not choose a persona unless the setup workflow instructs it.
