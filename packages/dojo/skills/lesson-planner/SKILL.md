---
name: lesson-planner
description: Build instructional lesson plans for Dojo coaching sessions. Internal skill for coaching personas — produces real lesson plans with objectives, assessment, timed structure, differentiation, and misconception handling.
user-invocable: false
argument-hint: <domain> <concept-id>
allowed-tools: Read, Write, Bash(dojo *), Bash(mkdir *)
---

# Lesson Planner

Build a real instructional lesson plan for a concept before teaching it. You are a teacher preparing a lesson — not generating a topic outline.

A lesson plan is a teaching instrument. It tells you what the student will DO, how you'll know they got it, what to ask and when, what they'll get wrong, and how to adjust. Without this, you're improvising.

## Process

Create a task for each step before starting:

1. TaskCreate: "Design the lesson — think through instructional design"
2. TaskCreate: "Write the lesson plan file"
3. TaskCreate: "Register the plan with dojo CLI"

Mark each task complete as you finish it. Do not proceed to the next step until the current task is marked complete.

### Step 1: Design the Lesson

Gather your inputs from session context:

- **Concept data** from `dojo lesson get` or the concept queue: id, title, description, prerequisites, difficulty_estimate (1-5), curated resources
- **Learner state**: mastery level (none/introduced/practiced/reinforced/solid), FSRS card state, struggle_points, confusion_pairs, prior assignments
- **Learning context**: sprint / skill-build / problem-solve / deep-mastery
- **Prior lesson plan** (if revising): read via `dojo lesson get <domain> <concept-id>`
- **Lore context**: what you know about the learner from prior sessions

If any input is missing, work with what you have. Do not block on missing data — a plan with gaps is better than no plan.

Think through these before writing anything:

- **What will the learner DO after this lesson?** Not "understand" — observable actions. "Write a function that uses channels" not "understand concurrency."
- **What do they already know?** Prerequisites met, mastery level, prior struggles. This determines your starting point.
- **What will they get wrong?** Every concept has predictable misconceptions. Name them. Plan for them.
- **How will you know they got it?** Define the evidence before you teach. Not "they seem to get it" — specific observable criteria.
- **What if they're ahead? Behind?** You need both paths before you start, not improvised mid-lesson.

### Step 2: Write the Lesson Plan

READ the schema: `${CLAUDE_SKILL_DIR}/reference/lesson-plan-schema.md`

Write the plan following that schema exactly. Every section is required — a missing section means you haven't thought through that aspect of the lesson.

Adapt the plan shape to the learning context:

**Sprint** — Compress everything. Opening is one question. Instruction is direct delivery, no extended analogy. Guided practice is short. Skip independent practice if time-constrained. Bridge is optional. Target 5-7 minutes.

**Skill-Build** — Full schema. Every section populated. Resource-driven instruction when resources exist. Both practice phases. Bridge always included. Target 10-15 minutes.

**Problem-Solve** — Invert the structure. Open with the Guided Practice task (the problem). Instruction fills gaps revealed by the attempt. Independent Practice is the learner re-attempting the original problem with new knowledge. Target 8-12 minutes.

**Deep-Mastery** — Extend Instruction and Key Questions. Simplify phase includes WHY the concept exists, what it replaced, what fails without it. Questions are Socratic — "what would break if..." Mental model includes its failure modes. Practice is design-oriented, not execution. Target 12-15 minutes.

Save the plan file:
1. `mkdir -p ~/.local/share/dojo/lessons/<domain>/`
2. Write to `~/.local/share/dojo/lessons/<domain>/<concept-id>.md`

### Step 3: Register the Plan

Register the plan with the dojo CLI:

```bash
dojo lesson set-path <domain> <concept-id> ~/.local/share/dojo/lessons/<domain>/<concept-id>.md
```

Then teach from the plan. The plan is your instrument, not a script to read verbatim.

## Anti-Patterns

- **Topic outline disguised as a lesson plan**: "Core Idea + Practice Seed" is notes, not a plan. Every section in the schema exists because a real teacher needs it.
- **Recall questions as assessment**: "What is X?" tests memory, not understanding. Assessment must observe the learner DOING something.
- **Missing differentiation**: If you don't plan for ahead/behind before teaching, you'll improvise poorly when it happens.
- **Generic misconceptions**: "Students might find this confusing" is useless. Name the SPECIFIC wrong belief and its root cause.
- **Untimed structure**: A lesson plan without timing is a wish list. The micro-session constraint (5-15 min) forces prioritization.
