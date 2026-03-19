---
name: Session Exit
description: Persists all session data — FSRS ratings, session history, confusion pairs, and optional Lore capture. Runs after the coaching session workflow (session.md) completes. This is the single persistence point for all session state.
trigger: User says 'done', '/exit', 'finished', or 'quit' after a coaching session
---

# Session Exit Workflow

End a coaching session by persisting all state accumulated during the session. The session workflow tracks everything in conversation context; this workflow writes it to disk via CLI calls, then displays a closing summary.

---

## Before You Begin: Reconstruct Session State

Before issuing any CLI calls, reconstruct the following from conversation context:

- **Domain name** — the domain slug from the session (e.g., `spanish`, `go-programming`)
- **Persona slug** — the persona used during the session (e.g., `marcus`, `quinn`)
- **Learning context** — the domain's context setting (`sprint`, `skill-build`, `problem-solve`, `deep-mastery`)
- **Concepts covered** — list of concept IDs with their outcomes:
  - `nailed` — solved correctly, no significant errors
  - `struggled` — significant errors or misconceptions
  - `partial` — got the idea but had minor errors
- **Struggle descriptions** — what specifically was difficult for struggled/partial concepts
- **Confusion pairs** — pairs newly identified this session only (not pairs already in the system)
- **Resources suggested** — any resources recommended during the session (title, URL, type, quality, free, note)
- **Resources used** — URLs the learner actually engaged with
- **Breakthrough moments** — notable moments of understanding
- **Approximate duration** — session length in minutes

If any of this information is not available from conversation context, use reasonable defaults (empty arrays for missing lists, estimate duration from conversation length).

---

## Step 1: Session Summary

Generate a human-readable summary from the reconstructed session state. Format:

- "We covered N concepts today: [list of concept titles]."
- "You nailed [concept A] and [concept B]."
- "We worked through [concept C] — the tricky part was [struggle description]."
- "Breakthrough: [if any breakthrough moments noted]."

This summary serves two purposes:
1. Displayed to the user immediately as a recap.
2. Used as the content for Lore capture in Step 5.

---

## Step 2: FSRS Ratings Per Concept

For each concept covered, assign a rating based on actual session performance — not optimism.

### Rating Decision Table

| Performance | FSRS Rating |
|-------------|-------------|
| Nailed — solved correctly, no hesitation | `easy` |
| Nailed — solved correctly with some thought | `good` |
| Partial — got the idea, minor errors | `hard` |
| Struggled — significant errors or misconceptions | `again` |

**Default rule:** If the outcome is unclear from conversation context, use `hard` — review sooner is safer than review later.

### Mastery Level Guide

Assign a mastery level alongside the rating:

| Situation | Mastery Level |
|-----------|---------------|
| First time covering concept + struggled | `introduced` |
| First time covering concept + good/easy | `introduced` |
| Reviewed concept + good/easy + 2+ sessions | `practiced` |
| Reviewed concept + solid recall, no errors | `reinforced` |
| Multiple sessions, consistent solid performance | `solid` |

### CLI Call

For each concept covered:

```bash
dojo progress update <domain> <concept-id> \
  --rating <again|hard|good|easy> \
  --mastery <none|introduced|practiced|reinforced|solid>
```

Collect the `next_due` field from each successful response — it is needed for the closing display in Step 6.

**If a concept was covered twice in the session**, use the final outcome for the FSRS rating.

**If `dojo progress update` fails for one concept**, continue with remaining concepts. Report any failures at the end: "Note: FSRS rating for [concept] failed — [error]. You may need to re-rate it manually."

---

## Step 3: Record Confusion Pairs

Only record pairs newly identified this session — pairs already in the system are idempotent but create clutter.

For each new confusion pair:

```bash
dojo progress add-confusion <domain> <concept-a> <concept-b>
```

If no new confusion pairs were encountered this session, skip this step.

---

## Step 4: Record Session

Record the full session to domain history:

```bash
dojo session record <domain> --data '{
  "concepts_covered": ["<concept-id-1>", "<concept-id-2>"],
  "calibration": "<too-easy|right|too-hard>",
  "duration_minutes": <N>,
  "persona": "<persona-slug>",
  "context": "<learning-context>",
  "confusion_pairs_encountered": ["<concept-a>-<concept-b>"],
  "resources_suggested": [{"title": "...", "url": "...", "type": "...", "quality": "...", "free": true, "note": "..."}],
  "resources_used": ["<url>"],
  "breakthrough_moments": ["..."],
  "struggle_descriptions": ["..."]
}'
```

### Required vs Optional Fields

| Field | Required | Empty Default |
|-------|----------|---------------|
| `concepts_covered` | Yes | `[]` |
| `calibration` | Yes | `"right"` |
| `duration_minutes` | Yes | Estimate from conversation length |
| `persona` | Yes | Persona slug from session |
| `context` | Yes | Learning context from domain |
| `confusion_pairs_encountered` | No | `[]` |
| `resources_suggested` | No | `[]` |
| `resources_used` | No | `[]` |
| `breakthrough_moments` | No | `[]` |
| `struggle_descriptions` | No | `[]` |

### Calibration Rule

- `too-easy` — user got everything easily with no struggle
- `too-hard` — consistent struggle throughout the session
- `right` — otherwise

**Important:** The CLI derives `date` and `time_of_day` automatically — do not include them in the JSON.

**Important:** If `dojo session record` fails, report the error to the user. Do not silently skip — session history is lost if not recorded.

---

## Step 5: Lore Capture (Optional)

Check if the Lore CLI is available:

```bash
which lore 2>/dev/null
```

**If available:**

```bash
lore capture learning \
  --topic <domain> \
  --persona <persona-slug> \
  --progress "<summary-text>"
```

Where `<summary-text>` is the session summary from Step 1.

**If `lore` is not on PATH:** "Lore capture skipped — `lore` not on PATH. Install Lore to enable session capture." Do not fail.

**If `lore capture` fails** (network error, Lore error): "Lore capture failed — [error]. Session data is saved. Lore capture can be retried manually." Do not fail.

---

## Step 6: Closing Display

Present a closing summary to the user:

1. **Concepts covered** — brief recap of what was practiced and outcomes.
2. **Next reviews** — from the `next_due` field returned by each `dojo progress update` call in Step 2. Format: "Next reviews: [concept A] in [N] days, [concept B] in [N] days." If `next_due` was not captured, omit the schedule rather than guessing.
3. **Coming up next** — model's inference based on curriculum structure and what concepts are ready to introduce. No extra CLI call needed.
4. **Persona-voiced encouragement** — in character from the session persona. Match the persona's voice and archetype for a closing line.

---

## Error Handling

| Error | Response |
|-------|----------|
| `dojo` not on PATH | "dojo CLI not found — state cannot be saved. Run `dojo init` and retry with the exit summary." Stop. |
| `dojo progress update` fails for one concept | Continue with remaining concepts. Report failure at the end: "Note: FSRS rating for [concept] failed — [error]. You may need to re-rate it manually." |
| `dojo session record` fails | "Session record failed — [error]. Session data was NOT saved to history. Your progress ratings (Steps 2-3) were saved." Report the full error. |
| `lore` not on PATH | "Lore capture skipped — `lore` not on PATH. Install Lore to enable session capture." Do not fail. |
| `lore capture` fails | "Lore capture failed — [error]. Session data is saved. Lore capture can be retried manually." Do not fail. |
| Zero concepts covered (empty session) | Skip Steps 2 and 3. Proceed to Step 4 with `concepts_covered: []`. |
