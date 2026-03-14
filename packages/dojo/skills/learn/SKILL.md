---
name: learn
description: AI-powered coaching for any learning domain. USE WHEN user wants to learn something, start a study session, set up a new domain, check progress, or get a learning nudge.
---

# Learn

Guide users through learning any domain using spaced repetition, curated curricula, and persona-driven coaching.

## Domain Staleness

!`dojo nudge 2>/dev/null`

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
