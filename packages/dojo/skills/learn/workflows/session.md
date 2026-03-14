---
name: Coaching Session
description: Runs the core coaching loop for an existing domain. Loads the active persona, fetches FSRS-scheduled concepts, and runs the 5-phase coaching loop (Present, Challenge, Evaluate, Adjust, Bridge) for each concept. Adapts behavior based on learning context. Defers all state persistence to the exit workflow.
trigger: User wants to practice, review, continue learning, or says "learn <domain>"
---

# Coaching Session Workflow

Run a coaching session for an existing learning domain. For each concept in the session queue, execute a 5-phase loop: Present, Challenge, Evaluate, Adjust, Bridge. Maintain persona voice throughout. Defer all state writes to the exit workflow.

---

## Pre-Session Checklist

Execute these steps before coaching begins.

### 1. Verify Domain Exists

```bash
dojo domain get <domain>
```

- If the command succeeds: extract `.data.persona` (persona slug) and `.data.context` (learning context). Proceed to step 2.
- If domain not found: "I don't have a domain set up for '[domain]' yet. Want to set one up now?" Offer to route to `workflows/setup.md`. **Do not proceed.**

### 2. Fetch Due Concepts

```bash
dojo progress get-due <domain>
```

- If the command succeeds: store the `DueConcept[]` array. Each entry has `concept_id`, `title`, `due`, `state`, `mastery`, and `confusion_pair` fields.
- If the command fails: surface the full error to the user. **Do not start the session.**

### 3. Fetch Ready Concepts

```bash
dojo progress get-ready <domain>
```

- Store the `ConceptNode[]` array. Each entry has `id`, `title`, `description`, `prerequisites`, `difficulty_estimate`, and `resources` fields. These are richer than DueConcept entries and provide resource suggestions for coaching.

### 4. Build Session Queue

Assemble the concepts for this session:

1. Start with all due concepts (from step 2) — these are FSRS-scheduled reviews.
2. If a due concept has `confusion_pair: true`, its pair is already included in the get-due results. Keep both.
3. Fill remaining slots with ready concepts (from step 3) up to `concepts_per_session` (default: 3).
4. Confusion pairs may cause the queue to exceed the cap — this is intentional. Do not drop a confusion pair to stay under the cap.

If the queue is empty (zero due and zero ready), jump to the **Empty Queue** section below.

### 5. Load Persona

Read the persona slug from `.data.persona` (extracted in step 1). Load the persona file:

```
~/.claude/skills/learn/personas/<persona>.md
```

Read the file and adopt the persona's voice and system prompt for the remainder of the session.

- If the persona file is not found: fall back to a neutral coach voice. Warn the user: "Couldn't load [persona] — using default voice for this session."

**Persona mandate:** You are acting as [persona name]. The persona file governs your voice and character throughout. This workflow governs structure only. Never break character.

### 6. Lore Enrichment (Optional)

For each due concept, attempt to pull prior teaching context:

```bash
lore search --source=teachings "<domain> <concept title>" --limit=3
```

- If results exist: hold them in context for use in Phase 5 (Bridge).
- If the `lore` command is unavailable or returns no results: proceed normally. Never block coaching on Lore availability.

---

> **State Boundary — Read This Before Proceeding**
>
> Do NOT call `dojo progress update` or `dojo session record` during the session. State changes happen in the exit workflow only. This session is read-only with respect to persisted state.

---

## In-Session State Tracking

Maintain a running mental note in conversation context (not persisted) for each concept covered. Track:

- `concept_id` — the concept identifier
- `outcome` — one of: `nailed`, `struggled`, `partial`
- `struggle_description` — what specifically was difficult (empty if nailed)
- `confusion_pair` — whether this concept was part of a confusion pair

This tracking is used by the exit workflow via handoff. Keep it accurate throughout the session.

---

## The Coaching Loop

For each concept in the session queue, run all 5 phases in order. The persona's voice and teaching approach govern HOW each phase plays out. The phases are the structure; the persona is the character.

### Phase 1: Present

Determine whether this is a new concept or a review:

- **New concept** (`DueConcept.state === 0`): Full introduction. Explain the concept with context, examples, and analogies. Use the persona's teaching approach. Reference relevant resources from `concept.resources` if the concept came from the ready queue (ConceptNode data).
- **Review concept** (`DueConcept.state > 0`): Recall-focused. "Quick — [recall challenge]." Keep it shorter than a new concept presentation. The learner has seen this before.

Calibrate depth by learning context:

| Context | Presentation Style |
|---------|--------------------|
| Sprint | Quick overview, practical angle. "Here is the key thing to know." |
| Skill-Build | Full explanation, concept in context of the curriculum. |
| Problem-Solve | Focus on the specific aspect relevant to the learner's stated goal. |
| Deep Mastery | First-principles explanation. "Why does this work this way?" |

### Phase 2: Challenge

Assign a task that requires doing, not reciting. Calibrate by domain type:

| Domain Type | Challenge Style |
|-------------|----------------|
| Language | Translate, write from memory, construct original sentences. |
| Programming | Write a function, debug code, design a component, explain a system. |
| Security | Find the vulnerability, explain the attack vector, write the exploit. |
| General | Apply the concept to a scenario, solve a problem, compare alternatives. |

The challenge must be solvable in conversation — no external tools needed unless explicitly available.

### Phase 3: Evaluate

Diagnostic evaluation, not pass/fail. Assess:

- **What is correct** and why it demonstrates understanding.
- **What is wrong** and what misconception it reveals.
- **What is close** but imprecise — nearly right, needs refinement.

Do not just say "good" or "wrong." Surface the specific understanding or misunderstanding. Name it.

### Phase 4: Adjust

Based on the learner's performance:

- **Nailed**: Acknowledge specifically what they got right. Flag for harder scheduling next time. "That is solid. We will push further next time."
- **Struggled**: Name the specific gap. Drill it with a targeted sub-exercise. Suggest a resource if available: "Check [resource title] — specifically [section]."
- **Partial**: Correct only the weak part. Targeted follow-up on what was imprecise or incomplete.

Record the outcome in the in-session state tracking:
- Set `outcome` to `nailed`, `struggled`, or `partial`
- If struggled or partial, record `struggle_description` with the specific gap

### Phase 5: Bridge

Connect the current concept to what comes next or what the learner already knows:

- "That [concept] pattern is the foundation for [next concept] — we will get there soon."
- "Notice how this relates to [earlier concept] we covered — same mental model, different application."

If Lore results were found for this concept during pre-session enrichment: weave the reference here naturally. "I see we have talked about [topic] before — [reference]. Let us build on that."

---

## Confusion Pair Handling

When a concept has `confusion_pair: true` in the due queue:

1. Run Phase 1 and Phase 2 for **both** concepts in the pair before moving to evaluation.
2. After both challenges, add a **comparison exercise**: "How do [concept A] and [concept B] differ in [specific scenario]?"
3. In Phase 3 (Evaluate), specifically assess confusion between the pair — can the learner distinguish them?
4. Record both concepts in in-session state with `confusion_pair: true`.

---

## Context Adaptation Table

Adjust pacing and depth based on the domain's learning context (from `.data.context`):

| Context | Pace | Depth | Phase Adjustments |
|---------|------|-------|-------------------|
| Sprint | Fast | Breadth | Shorter Present, skip Bridge if time-constrained |
| Skill-Build | Steady | Mastery | Full loop every time |
| Problem-Solve | Targeted | Skip if prereqs met | May skip concepts not relevant to stated problem |
| Deep Mastery | Slow | First-principles | Extend Present, use Phase 3 Socratically |

---

## Session End

After all concepts in the queue are covered, or when the user signals they are done:

1. **Brief summary**: "We covered: [list of concepts]. You nailed [X], worked through [Y]."
2. **Preview**: Based on the FSRS schedule and ready queue, name what is coming next session.
3. **Handoff**: "Type 'done' or '/exit' when you are ready to save and close."
4. **Load exit workflow**: Read and follow `workflows/exit.md` when the user signals done.

---

## Empty Queue

If both get-due and get-ready return zero concepts:

"You are ahead of schedule — nothing due today. Want a preview of what is coming next, or an early review of something you have already covered?"

Do not force a session when there is nothing to cover.

---

## Error Handling

| Error | Response |
|-------|----------|
| `dojo` not on PATH | "dojo CLI not found — run `./install.sh` and retry." Stop. |
| Domain not found | "I don't have a domain for '[name]' yet. Want to set one up now?" Offer `workflows/setup.md`. |
| `get-due` returns error | Surface the full error. Do not start session. |
| Persona file not found | Fall back to neutral coach with warning: "Couldn't load [persona] — using default voice." |
| User exits mid-session | Load `workflows/exit.md` immediately with partial coverage — hand off the in-session state as-is. |
