# Lesson Plan Schema

Write the plan as markdown with this structure. Every section is required — a missing section means you haven't thought through that aspect of the lesson.

```markdown
---
concept: <concept-id>
domain: <domain>
learning_context: <sprint|skill-build|problem-solve|deep-mastery>
difficulty: <1-5>
estimated_duration: <minutes>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Learning Objectives

What the learner will be able to DO after this lesson. Measurable, observable outcomes.

- [ ] <verb> <specific outcome> (e.g., "Write a goroutine that sends values on a channel")
- [ ] <verb> <specific outcome>
- [ ] <verb> <specific outcome>

Verbs: write, build, identify, debug, translate, design, trace, compare, construct, solve, apply, differentiate
NEVER use: understand, know, learn, appreciate, be familiar with, be aware of

## Assessment Criteria

How you verify each objective was met. Tied 1:1 to objectives above.

| Objective | Evidence | Threshold |
|-----------|----------|-----------|
| [objective 1] | [what you observe] | [minimum for "met"] |
| [objective 2] | [what you observe] | [minimum for "met"] |

## Lesson Structure

Timed sequence within the session's micro-session constraint (5-15 minutes).

### Opening (~1-2 min)
- Hook: [How you open — question, puzzle, provocation, connection to prior knowledge]
- Frame: [One sentence — what this lesson is about and why it matters now]
- Prior check: [Quick probe to verify prerequisites are solid]

### Instruction (~3-5 min)
- Core delivery: [The essential concept — aligned to Step 1 Simplify + Step 2 Mental Model from coaching framework]
- Key analogy: [The structural model the learner will hold]
- Worked example: [Concrete application with visible reasoning — aligned to Step 3]
- Resource integration: [Which curated resource to reference and how]

### Guided Practice (~3-5 min)
- Task: [Production task — write, build, debug, design, trace, solve]
- Scaffolding: [What support to provide during the attempt]
- Checkpoints: [Where to pause and verify understanding mid-task]

### Independent Practice (~2-3 min)
- Task: [Harder variant or extension — learner works without scaffolding]
- Success looks like: [Observable outcome that confirms the objective]

### Wrap-up (~1-2 min)
- Bridge: [Connection to next concept or prior knowledge — aligned to Step 5]
- Key takeaway: [One sentence the learner should remember]

## Materials

Resources needed for this lesson, drawn from the concept's curated resources.

| Resource | Role in Lesson | When Used |
|----------|---------------|-----------|
| [title + URL] | [how it's used — reference, walkthrough, supplementary] | [which phase] |

If no curated resources exist: state "Model-delivered — no external resources for this concept" and design the lesson accordingly.

## Key Questions

Specific questions to ask at specific points. Not generic — tied to this concept's content.

| Phase | Question | Purpose | If Wrong |
|-------|----------|---------|----------|
| Opening | [question] | [what it checks] | [how to redirect] |
| Instruction | [question] | [what it checks] | [how to redirect] |
| Guided Practice | [question] | [what it checks] | [how to redirect] |

Minimum 4 questions. Questions must check UNDERSTANDING, not recall. "What would happen if..." not "What is..."

## Anticipated Misconceptions

What learners typically get wrong with this concept. Plan the correction before you encounter it.

| Misconception | Why It Happens | How to Address |
|---------------|---------------|----------------|
| [wrong belief] | [root cause — prior knowledge interference, false analogy, surface similarity] | [specific correction strategy] |

If the learner has known confusion_pairs: include entries for each pair explaining the differentiation.

## Differentiation

### If Ahead (learner demonstrates mastery quickly)
- Skip: [which phases to compress or skip]
- Extend: [harder challenge, edge case, connection to advanced concept]
- Accelerate: [move to next concept in queue if time allows]

### If Behind (learner struggles with prerequisites)
- Backfill: [which prerequisite to revisit and how — briefly, not a full re-teach]
- Simplify: [reduce the current lesson's scope to essential core only]
- Scaffold more: [additional support strategies — partial solutions, smaller steps, more examples]

### If Stuck (learner is frustrated or shut down)
- Pivot: [different angle on the same concept — new analogy, different domain example]
- Reduce: [smallest possible version of the concept that still delivers value]
- Exit: [when to stop pushing and move to a different concept — preserve motivation]

## Success Criteria

What "good enough" looks like for this lesson. Not perfection — the minimum bar for moving forward.

- **Met all objectives**: [what this looks like concretely]
- **Met some objectives**: [which objectives are critical vs nice-to-have, what to schedule for review]
- **Met no objectives**: [what to do — reschedule, change approach, check prerequisites]

## Prior Session Notes

[Empty on first creation. After teaching, append dated notes:]
[- YYYY-MM-DD: What the learner struggled with, what clicked, adjustments for next time]
```
