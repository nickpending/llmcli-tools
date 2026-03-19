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

| Intent / Keywords | Workflow |
|-------------------|----------|
| setup, new domain, start learning, "teach me", "I want to learn" | `workflows/setup.md` |
| session, learn, practice, review, continue | `workflows/session.md` |
| done, exit, finished, quit session | `workflows/exit.md` |
| status, progress, overview, how am I doing | `workflows/status.md` |

## Execute

1. **Determine workflow** from user's request using the routing table above
2. **Read** the appropriate workflow file from this skill's directory
3. **Follow** the workflow instructions exactly

## Personas

11 teaching personas available in `personas/`. Each workflow that needs a persona will specify how to load one. Do not choose a persona unless the workflow instructs it.
