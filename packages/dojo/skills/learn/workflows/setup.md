---
name: Domain Setup
description: Configures a new learning domain end-to-end. Guides the user through goal setting, context selection, persona selection, optional source ingestion, curriculum generation, resource curation, and validation. Hands off to session workflow when complete.
trigger: User wants to set up a new learning domain or says "teach me X"
---

# Domain Setup Workflow

Set up a new learning domain through a 10-step guided conversation. Each step collects input from the user or executes CLI commands to persist domain state.

## Pre-Flight Check

Before starting, verify the dojo CLI is available:

```bash
dojo domain list
```

- If this succeeds (returns JSON): proceed to Step 1.
- If `command not found` or similar error: tell the user "dojo CLI not found — run `dojo init` from the dojo project directory, then retry." **Do not proceed.**

---

## Step 1: Domain Name

Ask: **"What do you want to learn?"**

Take the user's answer and normalize it to a lowercase-hyphenated slug:
- "Web Security" becomes `web-security`
- "Go programming" becomes `go-programming`
- "Spanish" becomes `spanish`

Confirm the domain name with the user before proceeding.

**Check if domain already exists:**

```bash
dojo domain get <name>
```

- If the command succeeds (domain exists): tell the user "You already have a **[name]** domain set up." Offer two choices:
  - **(a) Update it** — continue to Steps 2-5 to collect new goal/context/persona, then use `dojo domain update` in Step 6 instead of `dojo domain init`
  - **(b) Start a session** — skip setup entirely and hand off to `workflows/session.md`
- If the command fails (domain does not exist): proceed to Step 2.

---

## Step 2: Goal

Ask: **"What's your goal with [domain]?"**

Capture the user's free-text response. This becomes the `--goal` value in Step 6.

Examples of good goals:
- "Be able to write production Go services in 3 months"
- "Pass the DELE B2 exam by June"
- "Understand OAuth2 well enough to implement it from scratch"

---

## Step 3: Learning Context

Ask: **"How do you want to approach this?"** and present these options:

| Context | Description |
|---------|-------------|
| `sprint` | Fast and practical — deadline, job interview, quick project |
| `skill-build` | Steady mastery — ongoing learning, career development |
| `problem-solve` | Targeted — specific gap, debugging a concept |
| `deep-mastery` | First principles — research, deep expertise |

The user's choice becomes the `--context` value in Step 6. Only these four values are valid.

---

## Step 4: Source Materials (Optional)

Ask: **"Do you have any source materials? (book files, YouTube URLs, course URLs — or say 'no' to use my knowledge)"**

- If the user says **no**: skip to Step 5.
- If the user provides sources: proceed to Step 4a for each source.

### Step 4a: Source Ingestion

Process each source to extract content for curriculum generation. **Sources enrich the curriculum generation in Step 7 only — they are not persisted to domain state via CLI.** There is no CLI command to store sources.

**For YouTube URLs:**

```bash
yt-dlp --write-auto-sub --skip-download --sub-lang en \
  -o "/tmp/dojo-%(id)s" "<URL>"
```

Then read the transcript file at `/tmp/dojo-<id>.en.vtt` and use its content to inform curriculum generation.

**For PDF or local files:** Use the Read tool directly. Extract key topics, structure, and chapter organization.

**For web URLs:** Use WebFetch to retrieve content. Extract key topics and structure.

**Failure handling:**
- `yt-dlp` not found: "No yt-dlp available — I'll use my knowledge about this topic instead." Continue without the transcript.
- PDF read fails: skip the file, note it was not scanned. Continue with other sources or model knowledge.
- URL unreachable: skip the URL, note it was not scanned. Continue with other sources or model knowledge.

After processing all sources, hold the extracted content in context for use in Step 7. Do not attempt to persist sources.

---

## Step 5: Persona Selection

Read the persona files from `~/.claude/skills/learn/personas/` to display options.

Present the 11 available personas with their archetypes:

| Persona | Slug | Archetype |
|---------|------|-----------|
| Marcus | `marcus` | Coach / Mentor |
| Elena (Analyst) | `elena-analyst` | Facilitator |
| Elena (Scientist) | `elena-scientist` | Researcher |
| Kaz | `kaz` | Engineer / Experience Guide |
| Mariana | `mariana` | Storyteller |
| Mira | `mira` | Mindful Guide |
| Miriam Katz | `miriam-katz` | Practitioner |
| Miriam Khoury | `miriam-khoury` | Socratic Guide |
| Quinn | `quinn` | Hacker / Challenger |
| Thales | `thales` | Philosopher |
| Vera | `vera` | Debugger |

**Recommend one persona** based on the user's domain + context combination:

| Domain + Context | Recommendation |
|-----------------|----------------|
| Programming + Deep Mastery | Miriam Khoury (Socratic) or Vera (Debugger) |
| Programming + Sprint | Kaz (Engineer) or Quinn (Challenger) |
| Languages + Skill-Build | Marcus (Coach) or Mariana (Storyteller) |
| Security + any | Quinn (Hacker/Challenger) |
| General + Problem-Solve | Elena Analyst (Facilitator) |
| Research / Academic | Elena Scientist (Researcher) or Thales (Philosopher) |
| Mindfulness / Wellness | Mira (Mindful Guide) |

Give a one-sentence recommendation with reasoning. The user can override with any persona slug from the table above.

The chosen slug becomes the `--persona` value in Step 6.

---

## Step 6: Initialize Domain

**If this is a new domain** (domain did not exist in Step 1):

```bash
dojo domain init <name> --goal "<goal>" --context <context> --persona <persona>
```

**If updating an existing domain** (user chose option (a) in Step 1):

```bash
dojo domain update <name> --goal "<goal>" --context <context> --persona <persona>
```

Verify success by checking the command output. If it fails, report the error to the user and stop.

---

## Step 7: Curriculum Generation

Generate a structured concept graph from the sources gathered in Step 4a (if any) combined with model knowledge. Target **10-30 concepts** for a typical domain.

For each concept, produce:

| Field | Format | Description |
|-------|--------|-------------|
| `id` | lowercase-hyphenated | e.g., `present-tense-ar-verbs`, `goroutines` |
| `title` | Human-readable | e.g., "Present Tense AR Verbs", "Goroutines" |
| `description` | 1-2 sentences | What this concept covers |
| `prereqs` | list of concept IDs | What this builds on (can be empty) |
| `difficulty` | 1-5 integer | 1 = beginner, 5 = expert |

**Critical: Plan the insertion order before proceeding to Step 8.**

Sort concepts in topological order:
1. List all concepts with **no prerequisites** first (these have `prereqs: []`).
2. Then list concepts whose prerequisites are ALL in the already-listed set.
3. Continue until all concepts are ordered.
4. Verify: for every concept in the list, all of its prerequisite IDs appear earlier in the list.

This ordering is mandatory because the CLI enforces prerequisite existence at write time — adding a concept that references a prerequisite ID not yet in the domain will fail.

Do not show the full concept list to the user unless they ask. Instead, give a brief summary: "I've designed a curriculum with N concepts covering [high-level topics]. Shall I proceed?"

---

## Step 8: Add Concepts to Domain

Add concepts **strictly in the topological order** determined in Step 7. Concepts with no prerequisites go first. Do not reference a prerequisite ID until that concept has already been added via the CLI.

For each concept:

```bash
dojo curriculum add-concept <domain> \
  --id "<id>" \
  --title "<title>" \
  --description "<description>" \
  --prereqs '<json-array-of-prereq-ids>' \
  --difficulty <1-5>
```

Notes:
- Use single quotes around JSON values to avoid shell interpolation issues.
- `--prereqs` takes a JSON array: `'["concept-a", "concept-b"]'` or `'[]'` for no prerequisites.
- `--description` is optional but should always be included for session context.
- If a concept fails to add (e.g., duplicate ID, missing prereq), report the error and fix before continuing.

---

## Step 9: Curate Resources Per Concept

For each concept, curate 1-3 supplementary resources. Draw from:
- Official documentation (if applicable)
- Specific YouTube videos or channels (from model knowledge)
- Relevant book chapters (if source book was provided in Step 4, reference it)
- Interactive tools (playgrounds, exercises)

For each concept:

```bash
dojo curriculum set-resources <domain> <concept-id> \
  --resources '<json-array-of-resources>'
```

Each resource in the JSON array must use **exactly** these fields:

| Field | Type | Values |
|-------|------|--------|
| `title` | string | Resource title |
| `url` | string | Full URL |
| `type` | string | One of: `docs`, `video`, `book`, `course`, `tool`, `article` |
| `quality` | string | One of: `essential`, `recommended`, `supplementary` |
| `free` | boolean | `true` or `false` (not a string) |
| `note` | string | Brief note about the resource (use `""` if nothing to add) |

Example:

```bash
dojo curriculum set-resources golang goroutines \
  --resources '[{"title":"A Tour of Go - Goroutines","url":"https://go.dev/tour/concurrency/1","type":"docs","quality":"essential","free":true,"note":"Official interactive tutorial"}]'
```

After setting resources for all concepts, verify URLs:

```bash
dojo curriculum verify-urls <domain>
```

Report the results to the user: "Found N dead URLs — flagged but not blocking setup." Do not abort setup for dead URLs.

---

## Step 10: Validate and Hand Off

Run validation:

```bash
dojo curriculum validate <domain>
```

The command returns JSON with `data.acyclic` (boolean), `data.concept_count` (number), and `data.concepts_without_resources` (array).

**If `acyclic` is `true`:**

Tell the user: "Setup complete! **[Domain]** has **N concepts** ready. Starting your first session..."

Then hand off to the session workflow: read and follow `workflows/session.md`.

**If `acyclic` is `false`:**

The response includes `data.cycle` — a list of concept IDs involved in the circular dependency.

Tell the user: "I found a circular dependency — let me fix it before we start."

To fix:
1. Examine the cycle and identify which prerequisite edge is logically incorrect.
2. Re-add the concept without the offending prerequisite (there is no `remove-prereq` command — re-adding the concept with corrected prereqs overwrites it):

```bash
dojo curriculum add-concept <domain> \
  --id "<concept-id>" \
  --title "<title>" \
  --description "<description>" \
  --prereqs '<corrected-prereqs>' \
  --difficulty <difficulty>
```

3. Re-run `dojo curriculum validate <domain>` to confirm the cycle is resolved.
4. Once acyclic, proceed with the handoff above.

If concepts are missing resources (`concepts_without_resources` is non-empty), add resources for those concepts before handing off.

---

## Error Handling

| Error | Response |
|-------|----------|
| `dojo` not on PATH | "dojo CLI not found — run `dojo init` from the dojo project directory, then retry." Stop. |
| `yt-dlp` not found | "No yt-dlp available — I'll use my knowledge about this topic instead." Continue without transcript. |
| `domain init` fails (already exists) | Should not happen — Step 1 checks existence first. If it does: use `dojo domain update` instead. |
| `add-concept` fails (missing prereq) | Prerequisite ordering error. Re-check topological order and add the missing prereq concept first. |
| `add-concept` fails (duplicate ID) | Concept already exists. Skip or re-add with updated fields. |
| `verify-urls` reports dead URLs | Report count to user as a warning. Do not abort setup. |
| `validate` reports cycle | Fix by removing the logically incorrect prerequisite edge and re-adding the concept. |
| PDF/URL read fails | Skip the source, note it was not scanned. Continue with remaining sources or model knowledge. |
| Any unexpected CLI error | Report the full error to the user. Do not silently continue. |

---

## Handoff

When setup is complete and validation passes, read and follow `workflows/session.md` to start the user's first coaching session in the newly configured domain.
