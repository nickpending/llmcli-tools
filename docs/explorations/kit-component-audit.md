---
type: exploration
project: llmcli-tools
status: draft
started: 2026-03-26
updated: 2026-03-26
tags: [kit, security, audit, data-hygiene, skills, components]
---

# Kit Component Audit — Data Hygiene & Security Scanning

## Context

Claude Code skills, commands, agents, and tools run with full user privileges. Anthropic's plugin system explicitly states they don't verify plugin integrity or safety. Skills can read any file, execute any command, and send data anywhere. This creates two distinct threat models for distributable components managed by Kit.

Kit now manages 10 components across devices via the workshop repo and kit-catalog. As this grows, the risk surface grows with it.

## The Problem

### Threat Model 1: Self-Leak (Primary)

Your own components leak your own data. This is the more likely and more immediate risk.

**What leaks:**
- **Network infrastructure** — real IPs, hostnames, internal domains, subnet ranges in examples or references
- **File paths** — `/Users/rudy/`, `~/development/projects/`, internal directory structures
- **Architecture details** — component names, service endpoints, internal tool names, database paths
- **Credentials patterns** — not actual keys, but paths to them (`~/.ssh/`, `~/.aws/credentials`, `.env` locations)
- **Personal data** — usernames, email addresses, project names that reveal client work
- **Unsanitized examples** — real command output, real API responses, real log entries embedded in skill docs

**How it happens:**
- You build a skill with real examples (easier than writing synthetic ones)
- You include references with actual architecture details for context
- You copy a working command with real IPs into a template
- The workshop repo is private today but could be shared, forked, or accidentally made public

**Why it matters even in private repos:**
- Other devices/agents that sync get the data
- Team members who clone get the data
- Git history preserves it even after removal
- LLMs processing the skill content may surface leaked data in other contexts

### Threat Model 2: Third-Party Safety (Secondary)

Malicious or careless skills from external sources.

**Attack vectors:**
- **Data exfiltration** — skill reads `~/.ssh/id_rsa`, `~/.aws/credentials`, `.env` and sends to external URL via `Bash(curl *)` or embeds in agent prompts routed to external APIs
- **Arbitrary code execution** — hooks that run shell commands on every tool use, `once: true` hooks that execute setup scripts, tools/ directory with executables
- **Privilege escalation** — skill requests broad `allowed-tools` then uses access to modify other skills, CLAUDE.md, or settings.json
- **Prompt injection** — skill content contains instructions that override the user's intent, redirect agent behavior, or manipulate other skills
- **Persistence** — skill modifies system config, installs cron jobs, creates additional hooks that survive skill removal

**Why this is secondary:**
- Kit is designed for private distribution of YOUR components
- Third-party installation is a conscious choice with review opportunity
- The Claude Code plugin system (marketplace) is the intended channel for third-party distribution
- But: team members sharing skills within an org face this risk without realizing it

## What an Audit Would Check

### Self-Leak Detection

| Pattern | What to scan for | Severity |
|---------|-----------------|----------|
| IPv4/IPv6 addresses | `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`, `[0-9a-f:]{8,}` in non-code-block context | High |
| Internal hostnames | `.local`, `.internal`, `.lan`, `.home` domains | High |
| Home directory paths | `/Users/`, `/home/`, `~/` followed by real usernames | Medium |
| Project paths | Absolute paths to development directories | Medium |
| Credentials file references | `.ssh/`, `.aws/`, `.env`, `credentials`, `secrets` | High |
| API keys/tokens | Common patterns: `sk-`, `ghp_`, `AKIA`, `Bearer `, base64-like strings | Critical |
| Email addresses | Standard email regex | Medium |
| Internal service URLs | Non-public URLs, localhost with specific ports | Medium |
| Real command output | Output blocks containing internal data (IPs, hostnames, paths) | Medium |
| Git remote URLs | SSH URLs revealing org structure (`git@github.com:orgname/`) | Low |

### Third-Party Safety Checks

| Check | What to look for | Severity |
|-------|-----------------|----------|
| Unrestricted tool access | No `allowed-tools` on skills that run bash | High |
| External URL references | `curl`, `wget`, `fetch` to non-localhost URLs in skill body | High |
| Hook code execution | Hooks with `type: command` running scripts | High |
| Sensitive file reads | Explicit reads of `~/.ssh`, `~/.aws`, `.env`, `~/.config` | Critical |
| Broad file system access | `Read` without path constraints, `Glob` on home directory | Medium |
| Settings modification | References to `settings.json`, `CLAUDE.md` modification | High |
| Agent spawning | Skills that spawn agents with broad tool access | Medium |
| Obfuscation | Base64 encoded commands, eval/exec patterns | Critical |

## Architecture Options

### Option A: /kit audit workflow

Add `audit` as a workflow in the `/kit` skill. Runs in main thread, reads all installed components, reports findings.

**Pros:** Integrated with Kit, uses existing skill infrastructure, conversational (can explain findings)
**Cons:** LLM-based scanning is non-deterministic, costs tokens, slow for large catalogs

### Option B: Forked validator skill

`kit-audit` as a forked validator skill. Receives component paths via `$ARGUMENTS`, returns structured JSON with findings.

**Pros:** Deterministic output format, can be called by orchestrators, isolated execution
**Cons:** Still LLM-based, haiku may miss subtle patterns

### Option C: CLI tool (kit audit)

Add `audit` command to the Kit CLI. Uses regex patterns and AST-like scanning — no LLM needed for pattern matching.

**Pros:** Deterministic, fast, no token cost, can run in CI/pre-commit
**Cons:** Regex-only misses semantic issues (e.g., "this IP is an example" vs "this IP is real"), can't assess intent

### Option D: Hybrid — CLI patterns + LLM assessment

CLI tool does fast regex/pattern scanning and flags candidates. LLM (via skill or forked validator) assesses flagged items for actual risk — distinguishing real data from intentional examples.

**Pros:** Fast first pass, intelligent second pass, best of both worlds
**Cons:** Most complex to build, two-layer system

## Recommended Approach

**Option D (Hybrid)** — but phased:

**Phase 1:** CLI tool (`kit audit`) with regex patterns for self-leak detection. This catches the 80% case — hardcoded IPs, paths, credentials patterns. Fast, deterministic, no token cost. Can run as a pre-commit hook or CI check.

**Phase 2:** Add LLM assessment layer. For flagged items, a forked validator determines if the match is real data or intentional example content. Reduces false positives.

**Phase 3:** Third-party safety scanning. More complex checks for hooks, tool access, exfiltration patterns. This is the security review, not just hygiene.

## Open Questions

1. **False positive management** — how to handle intentional examples that contain IP-like patterns? Allow-list per component? Annotations in skill content (`<!-- audit:ignore -->`)?
2. **Baseline establishment** — should audit create a baseline on first run and then report deltas? Or scan fresh every time?
3. **Integration with Kit workflows** — should `kit add` run audit automatically before registering? Should `kit sync` audit incoming changes?
4. **Scope** — audit installed copies only, or also scan the source repo (workshop)?
5. **Output format** — human-readable report, structured JSON for CI, or both?
6. **Custom rules** — should users be able to define their own patterns (e.g., "flag any reference to my client name")?

## References

- [[llmcli-tools/kit-component-registry|Kit Component Registry]] — Kit's design and distribution model
- IndyDevDan, "The Library Meta-Skill" — private distribution context
- Anthropic Plugin Security Model — "plugins are highly trusted components, Anthropic does not verify plugin integrity or safety"
- Claude Code `allowed-tools` — existing per-skill sandboxing mechanism
