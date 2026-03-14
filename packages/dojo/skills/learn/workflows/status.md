---
name: Learning Status
description: Displays a formatted progress overview across all learning domains or a single domain. Read-only — no state is written. Shows mastery distribution, staleness warnings, and session counts.
trigger: User asks about progress, status, overview, or says "how am I doing"
---

# Learning Status Workflow

Display a formatted overview of learning progress across all domains or drill into a single domain. This workflow is read-only — it fetches data and formats it for display. No state is written.

---

## Pre-Flight Check

Verify the dojo CLI is available:

```bash
dojo session status
```

- If this succeeds (returns JSON): proceed to Step 1.
- If `command not found` or similar error: tell the user "dojo CLI not found — run `dojo init` from the dojo project directory, then retry." **Do not proceed.**

---

## Step 1: Determine Scope and Fetch Status Data

Determine whether the user is asking about all domains or a specific one:

- **All domains** (e.g., "how am I doing?", "show my progress"): run with no domain argument.
- **Single domain** (e.g., "how's my Spanish going?", "status of go-programming"): run with the domain slug.

### All Domains

```bash
dojo session status
```

### Single Domain

```bash
dojo session status <domain>
```

If the command fails with an error, surface the full error to the user. **Do not display partial data.**

If the named domain is not found, fetch the full domain list to help the user:

```bash
dojo session status
```

Then respond: "No domain '[name]' found. Available domains: [list from all-domains response]. Or did you want to set it up?"

---

## Step 2: Check for Empty State

Inspect the response from Step 1. If `data.domains` is an empty array:

"No domains set up yet. Want to start learning something new? Try describing what you want to learn."

**Do not proceed to Step 3.** The user needs to set up a domain first via `workflows/setup.md`.

---

## Step 3: Format and Display

### Multi-Domain Format

When showing all domains, use this format:

```
Learning Status — [today's date]

[Domain] ([N] sessions)
  Last session: [N days ago | today | never]
  Progress: [X solid, X reinforced, X practiced, X introduced, X new]
  Status: [On track | Getting cold (N days) | Never started]

[Domain] ([N] sessions)  Getting cold (N days)
  Last session: [N days ago]
  Progress: [X solid, X reinforced, X practiced, X introduced, X new]
  Status: Getting cold (N days)

Overall: [N] active domains, [N] total concepts
```

**Staleness indicator:** When `is_stale: true` for a domain, append `Getting cold ([N] days)` to the domain header line. Calculate days from the `last_session` timestamp relative to today.

**Mastery distribution:** Count concepts at each mastery level (solid, reinforced, practiced, introduced, none/new) and display as a single progress line per domain.

**Session count:** Total number of recorded sessions for the domain.

**Last session:** Format the `last_session` ISO timestamp as a human-readable relative date:
- Today: "today"
- Yesterday: "yesterday"
- Within a week: "N days ago"
- Older: "N days ago" or the formatted date

### Single-Domain Format

When showing a single domain, provide a full concept-level breakdown grouped by mastery level, from highest to lowest:

1. **Solid** — list concept titles
2. **Reinforced** — list concept titles
3. **Practiced** — list concept titles
4. **Introduced** — list concept titles
5. **New** (none) — list concept titles

**Verbosity rule:** If the domain has more than 15 concepts, summarize by mastery counts rather than listing every concept by name — unless the user explicitly asked for the full list.

Include the same header information as multi-domain format (sessions, last session, staleness) plus:
- Next due concepts and when they are scheduled
- Overall mastery percentage (solid + reinforced concepts / total concepts)

### Special Cases

**Zero sessions for a domain:** "0 sessions — all [N] concepts are new. Run a session to get started."

**All concepts solid:** "Mastered! All concepts are solid. Consider a refresher or adding a new domain."

**All domains stale:** Note all as stale in the display. Prompt for a session on any of them.

---

## Step 4: Next Action Prompt

After displaying status, offer to start a session:

"Want to start a session for any of these? Tell me which domain."

For stale domains, be more specific: "Your [domain] is getting cold — want to jump back in?"

If there is only one domain and it has due concepts, offer directly: "You have concepts due in [domain]. Want to start a session?"

---

## Error Handling

| Error | Response |
|-------|----------|
| `dojo` not on PATH | "dojo CLI not found — run `dojo init` from the dojo project directory, then retry." Stop. |
| `dojo session status` fails | Surface the full error to the user. Do not display partial data. |
| Named domain not found | "No domain '[name]' found. Available domains: [list from all-domains call]. Or did you want to set it up?" |
| All domains stale | Note all as stale in display; prompt for session on any. |
| Single domain, zero sessions | "0 sessions — all [N] concepts are new. Run a session to get started." |
| All concepts solid | "Mastered! All concepts are solid. Consider a refresher or adding a new domain." |
