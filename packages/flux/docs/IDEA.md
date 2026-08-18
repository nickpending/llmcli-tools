---
type: project
domain: technical
status: active
started: 2025-08-08
---
# Flux - Intelligent Knowledge Flow Management

## The Problem

**What specific problem does this solve?**

Current knowledge management has too much friction. Using Claude Desktop for capture and processing requires constant manual commands, decision-making during capture, and remembering to move completed items. The cognitive overhead of organizing kills the flow of capturing ideas and completing work.

**Who has this problem?**

Knowledge workers who:
- Capture ideas, tasks, and learning resources throughout the day
- Work across multiple projects simultaneously  
- Use AI assistants but find the workflow tedious
- Want to focus on doing, not organizing
- Need capture to work from any device

**How do they solve it today?**

Manual workflows with Claude Desktop:
- Run `/sweep` commands manually
- Process each item individually with y/n prompts
- Maintain 7+ separate files for organization
- Remember to clean up completed tasks
- Context switch constantly between capture and organization

## The Solution

**Core Value Proposition**

Flux transforms Claude Code into an intelligent knowledge assistant that captures naturally, organizes automatically, and maintains your knowledge system proactively - so you can focus on thinking and doing, not filing.

**Key Differentiators**

- **Natural language capture** - Say it naturally, Flux formats and routes it
- **Zero-decision capture** - Everything goes to inbox, Flux handles routing
- **Proactive maintenance** - System cleans itself without prompting
- **Multi-source capture** - Works whether Claude Code is running or not
- **Dynamic views** - Ask for any view, Flux generates it from your data
- **Completion tracking** - Just say "done with X" and Flux handles it

## System Flow (Initial Sketch)

1. **Natural Capture** - "Add idea for voice commands to project app"
2. **Smart Parsing** - Flux extracts type (idea), project (app), urgency
3. **Auto-formatting** - `- idea:: voice commands [app] captured:: 2025-01-16`
4. **Intelligent Routing** - To `projects/app/01-backlog.md` under Ideas
5. **Proactive Maintenance** - Archives old items, carries forward incomplete

## User Experience Vision

**Primary User Journey**

1. **Capture** - Say/type naturally in any context
2. **Work** - Focus on active.md, Flux handles the rest
3. **Complete** - Say "done with X", Flux confirms and archives

**Core User Workflows**

- **Quick capture** - "I need to watch this video {url}" → auto-routed with #learning #urgent
- **Project tasks** - "Add UI button to dashboard" → routed to project backlog
- **Completion** - "Finished the login bug" → finds, confirms, archives
- **Review** - "Show me learning items" → dynamic view generation
- **Scratchpad sync** - Mobile captures auto-process on Flux startup

**Success Criteria**

- Capture takes <5 seconds with zero decisions
- Inbox never exceeds 10 items
- Completed items auto-archive within 24 hours
- 90% of captures need no manual intervention
- Weekly reviews take <10 minutes

## MVP Definition

**What is the absolute minimum viable version?**

A Claude Code mode that auto-captures, auto-routes to the right project/category, tracks completion through natural language, and maintains a clean knowledge system without manual intervention.

**MVP Scope**

- Natural language capture with smart parsing
- Auto-routing to projects/categories based on tags
- Completion tracking through conversation
- Scratchpad processing on startup
- Basic dynamic view generation

**MVP Constraints**

- Fixed file structure initially (can evolve later)
- Limited to text capture (no email/voice yet)
- Manual trigger for reviews (not scheduled)
- Simple routing rules to start

**Post-MVP Evolution**

- Email integration for capture
- Voice memo transcription
- Scheduled reviews and maintenance
- Pattern learning and suggestions
- Cross-project insights

## Features Status

**Current Features:**

- 📋 **Natural Language Capture** - Parse intent and auto-format entries
- 📋 **Intelligent Routing** - Auto-route to projects/categories by content
- 📋 **Completion Tracking** - Find and complete items through conversation
- 📋 **Scratchpad Processing** - Auto-process mobile captures on startup
- 📋 **Dynamic Views** - Generate any view from data on demand
- 📋 **Auto-maintenance** - Archive old items, carry forward incomplete
- 📋 **Startup Routine** - Check scratch, process inbox, show status
- 📋 **Batch Operations** - Smart grouping for efficient processing

## Technical Approach

**Architecture Decision**

- [x] **Single Tool/Application** - Integrated solution as Claude Code mode overlay

**Why this approach?**

Flux operates as a mode overlay to Claude Code using `--append-system-prompt`, allowing it to modify behaviors while keeping all routing rules and intelligence embedded in a single FLUX.md file.

**Dependencies & Prerequisites**

- Claude Code CLI installed
- Obsidian vault with flux/ directory
- Shell alias for flux mode activation
- Basic project structure in obsidian/projects/

**Integration Requirements**

- Works alongside Momentum without interference
- Preserves existing CLAUDE.md behaviors where appropriate
- Maintains compatibility with other Claude Code commands
- Future: email, calendar, voice services

**Data Requirements**

- Markdown files for all storage
- Minimal structure: inbox, active, later, daily/, archive/
- Project backlogs at projects/*/01-backlog.md
- Scratchpad for offline capture

## Technical Architecture (Tentative)

**Data Design (Draft)**

```
~/obsidian/flux/
├── inbox.md      # All captures land here
├── active.md     # Current work
├── later.md      # General backlog  
├── scratch.md    # Mobile/offline captures
├── daily/        # Daily notes (auto-created)
│   └── YYYY-MM-DD.md
└── archive/      # Monthly archives
    └── YYYY-MM.md

~/obsidian/projects/
└── [project]/
    └── 01-backlog.md  # Project-specific items
```

**Component Architecture (Working Model)**

- **FLUX.md** - Agent overlay with all behaviors and rules
- **Capture Engine** - Natural language parsing and formatting
- **Routing Engine** - Tag/project-based auto-routing
- **Completion Tracker** - Fuzzy matching and confirmation
- **View Generator** - Dynamic report generation

**Integration Points (Planned)**

- Shell alias: `flux` command activates mode
- Startup hook: Process scratchpad automatically
- Future: Email folder monitoring, voice transcription API

**Tool/Technology Stack (Current Thinking)**

- Claude Code with --append-system-prompt
- Markdown for all data storage
- Shell scripting for installation
- Future: Email APIs, transcription services

## Implementation Strategy (Subject to Change)

**Iteration Priorities (Draft)**

1. FLUX.md agent with embedded routing rules
2. Natural language capture and parsing
3. Completion tracking and confirmation
4. Scratchpad processing
5. Dynamic view generation

**Deployment/Operations (Initial Thoughts)**

- Install script creates flux alias
- FLUX.md contains all intelligence
- No external config files needed
- All rules embedded in agent file

**Data Flow (Conceptual)**

```
Natural Input → Parse → Format → Route → Maintain
     ↑                                        ↓
Scratchpad ← Mobile Capture        Archive ← Time Decay
```

**Decision Logic (Draft)**

- Project detection: [projectname] in text
- Type inference: keywords (idea, bug, todo, watch, read)
- Urgency: #urgent, "soon", "today", due dates
- Learning: URLs, "watch", "read", "study", #learning

## Learning and Evolution

**Key Learnings**

- Manual sweeping creates too much friction
- Interactive y/n for each item doesn't scale
- Natural language is faster than structured input
- Completion tracking needs to be conversational
- Multi-source capture is essential for mobile use
- Environment variables in prompts need to be substituted at install time
- Auto-triggering startup with "Activate Flux" removes friction
- Running from obsidian root prevents .claude/ pollution
- Symlinked resources allow updates without reinstalling

**Evolution Notes**

- Moved from multi-file to minimal file structure
- Shifted from commands to conversational interaction
- Added scratchpad for offline capture
- Simplified from 7+ files to 3-4 core files
- Implemented as Claude Code mode overlay using --append-system-prompt
- Personalization during install (name, personality style)
- Resources (routing, file formats) loaded on startup for consistency

## Open Questions

**User/Market Questions**

- How to handle captures when traveling/offline for extended periods?
- What's the ideal review frequency for different types of content?
- Should completed items stay visible for some period?

**Technical Questions**

- Best way to implement fuzzy matching for completion?
- How to handle duplicate captures intelligently?
- Should routing rules be learnable or fixed?

**Operational Questions**

- How to backup/version the knowledge base?
- Integration with Obsidian sync?
- Handling of sensitive information in captures?

## Success Metrics

**Primary Metrics**

- Time from thought to capture: <5 seconds
- Percentage of auto-routed items: >90%
- Inbox size: <10 items average
- Review time: <10 minutes/week

**Learning Metrics**

- Capture patterns over time
- Project velocity (items completed/week)
- Knowledge decay (items archived without action)

## Risks and Assumptions

**Key Assumptions**

- Users want less organization, not more features
- Natural language is preferred over structured commands
- Auto-routing accuracy will be good enough
- Minimal file structure is sufficient

**Primary Risks**

- Routing accuracy might be poor initially
- Natural language parsing could be ambiguous
- Users might not trust automated organization
- Could lose items in auto-archival

**Mitigation Strategies**

- Always confirm before completing/archiving
- Keep archive searchable, never delete
- Start with simple routing rules, evolve based on usage
- Provide manual override commands as backup

## Relationship to Other Projects

**Lore**: Flux generates organized knowledge that lore indexes. Completed tasks, archived items, and learning progress feed into lore's knowledge base.

**Momentum**: Flux can route development-related captures to momentum projects. Task completions in momentum could feed back to obsidian.

**Prose**: Writing ideas captured in flux can trigger prose workflows. Blog drafts could be tracked as flux tasks.