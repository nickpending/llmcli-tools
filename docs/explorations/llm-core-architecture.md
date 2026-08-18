---
type: exploration
domain: technical
status: draft
started: 2026-02-04
updated: 2026-02-18
project: llmcli-tools
tags: [exploration, llm, transport, architecture, apiconf]
related: [[apiconf]], [[llm-summarize]], [[sable]], [[momentum]]
---

# llm-core: LLM Transport Layer

**Context:** Multiple tools in the llmcli-tools ecosystem need to make LLM calls. Currently, each tool (notably llm-summarize) bakes in its own provider logic. llm-core extracts that into a shared transport layer: prompt in, normalized result out. One place for provider wiring, used by many.

## Problem

Every tool that wants to talk to an LLM must:
- Implement provider-specific request/response handling
- Manage API keys and configuration
- Handle retries, timeouts, error mapping
- Normalize different response formats

This duplicates effort and couples domain tools to specific providers. When a new provider is added or an API changes, every tool needs updating.

### Why Not LiteLLM?

Prismis already uses LiteLLM (Python) for the same multi-provider routing problem. We evaluated whether to adopt it across the ecosystem.

**Decision: Build llm-core instead.**

- llmcli-tools is TypeScript-only. LiteLLM has no JS SDK.
- Using LiteLLM would require running a proxy server (always-on dependency) or switching to Python.
- Minimal dependencies is a core llmcli-tools principle. LiteLLM is a heavy Python package.
- We only need ~3 providers, not 100+. The abstraction is thin.

### Why Not Agent-Based LLM Calls?

For use cases like quality gate scoring (SDD rubrics), full agent spawn is overkill:
- Full context loading, tool access, reasoning loops
- Agent might "reason" itself into wrong scores
- No structured output guarantee
- Expensive for what's essentially a scoring call

Direct API calls via llm-core: minimal tokens, structured prompts, JSON output, fast and cheap.

## Architecture

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│ Domain Tools (application layer)                            │
│                                                             │
│  llm-summarize     sable-eval        future-tool           │
│  - builds prompt   - builds prompt   - builds prompt       │
│  - calls complete()- calls complete() - calls complete()   │
│  - parses summary  - parses scores   - parses whatever     │
│  - owns its JSON   - owns its JSON   - owns its parsing    │
│    extraction        extraction                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ llm-core (transport layer)                                  │
│                                                             │
│  - complete(): prompt in, normalized envelope out           │
│  - service-based routing (named services → adapters)        │
│  - credentials via apiconf (specific key per service)       │
│  - retries (3 attempts, exponential backoff, transient only)│
│  - cost estimation from local pricing config                │
│  - raw fetch() calls, no provider SDKs                      │
│                                                             │
│  Services config (~/.config/llm-core/services.toml):        │
│  - Named services map to adapter + apiconf key + base URL   │
│  - Supports multiple keys per provider                      │
│  - Default config written on first run (no hidden defaults) │
│                                                             │
│  Helpers (opt-in, not in pipeline):                         │
│  - extractJson(): strip markdown blocks, parse JSON         │
│  - isTruncated(): check if response hit token limit         │
│  - updatePricing(): refresh rates from community database   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ apiconf (config layer) — BUILT, v0.1.0                      │
│                                                             │
│  - Two-tier model: Keys (credentials) + Apps (profiles)     │
│  - TOML config at ~/.config/apiconf/config.toml             │
│  - Provider registry with canonical names                   │
│  - load(), getKey(), getEnvVar(), isValidProvider()         │
│  - TypeScript library, ESM, smol-toml dependency            │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principle: No Hidden Defaults

All configuration is visible and editable. No hardcoded URLs, no magic provider routing buried in source code.

On first run, llm-core writes a default `~/.config/llm-core/services.toml` with sensible defaults for known providers. If you want to know why `complete({ service: "anthropic" })` hits `api.anthropic.com`, you open the file and it's right there.

### Key Design Principle: No Content Interpretation

llm-core normalizes the **envelope** (consistent shape, tokens, provider info), NOT the **content**.

The `text` field returns exactly what the model said. No stripping, no parsing, no "helpful" cleanup. If the model wrapped JSON in a markdown code block, that's what you get. Only the caller knows what they asked for — they build their own parsers.

This prevents the tool from mangling content (e.g., stripping markdown when the caller actually asked for markdown).

Helpers like `extractJson()` are opt-in exports the caller can choose to use, never applied automatically by `complete()`.

## Services Layer

The routing unit in llm-core is a **named service**, not a provider. This supports multiple API keys per provider (personal, work, project-specific) and custom endpoints (MLX, proxies).

### Service Config

```toml
# ~/.config/llm-core/services.toml
# Written on first run with defaults. Fully visible and editable.

default_service = "anthropic"

[services.anthropic]
adapter = "anthropic"
key = "anthropic"                           # apiconf key name
base_url = "https://api.anthropic.com/v1"

[services.anthropic-work]
adapter = "anthropic"
key = "anthropic-work"                      # different apiconf key
base_url = "https://api.anthropic.com/v1"

[services.openai]
adapter = "openai"
key = "openai"
base_url = "https://api.openai.com/v1"

[services.ollama]
adapter = "ollama"
base_url = "http://localhost:11434"
key_required = false

[services.mlx]
adapter = "openai"                          # MLX speaks OpenAI-compatible
base_url = "http://localhost:8080/v1"
key_required = false
```

### Resolution Flow

When `complete({ service: "anthropic-work", model: "haiku" })` is called:

1. Look up `"anthropic-work"` in services.toml → get adapter, base URL, apiconf key name
2. Ask apiconf for the `"anthropic-work"` credential → get API key
3. Route to the `anthropic` adapter with the resolved URL + key
4. Adapter makes raw `fetch()`, returns normalized envelope

If `service` is omitted, uses `default_service` from config.

### Why Services, Not Just Providers

| Scenario | Provider-based | Service-based |
|----------|---------------|---------------|
| 3 Anthropic keys (personal, work, CI) | Can't distinguish | `anthropic`, `anthropic-work`, `anthropic-ci` |
| MLX local server | Needs new adapter | `mlx` service → OpenAI adapter + local URL |
| OpenAI-compatible proxy | Needs new adapter | New service → OpenAI adapter + proxy URL |
| Different base URLs per env | Hardcoded overrides | Different service configs |

## API Design

### The Envelope (CompleteResult)

```typescript
interface CompleteResult {
  /** Exactly what the model returned — no stripping, no interpretation */
  text: string;

  /** Actual model that ran (e.g. "claude-3-5-haiku-20241022") */
  model: string;

  /** Which backend handled the request */
  provider: "anthropic" | "openai" | "ollama";

  /** Normalized token usage */
  tokens: {
    input: number;
    output: number;
  };

  /** Why the model stopped — caller needs to know if truncated */
  finishReason: "stop" | "max_tokens" | "error";

  /** Wall clock time for the API call */
  durationMs: number;

  /** Estimated cost in USD, null for local/unknown models */
  cost: number | null;
}
```

**Provider response normalization:**

| Field | Anthropic | OpenAI | Ollama |
|-------|-----------|--------|--------|
| text | `content[0].text` | `choices[0].message.content` | `response` |
| model | `model` | `model` | `model` |
| tokens.input | `usage.input_tokens` | `usage.prompt_tokens` | `prompt_eval_count` |
| tokens.output | `usage.output_tokens` | `usage.completion_tokens` | `eval_count` |
| finishReason | `stop_reason` | `choices[0].finish_reason` | mapped from `done_reason` |

### The Input (CompleteOptions)

```typescript
interface CompleteOptions {
  /** The prompt text to send */
  prompt: string;

  /** Named service from services.toml — uses default_service if omitted */
  service?: string;

  /** Model name — provider default if omitted */
  model?: string;

  /** System prompt / instructions */
  systemPrompt?: string;

  /** Sampling temperature (0-1) */
  temperature?: number;

  /** Maximum output tokens */
  maxTokens?: number;

  /** Hint to provider to return JSON (OpenAI json_object mode, etc.) */
  json?: boolean;
}
```

### Public API

```typescript
// Core
export { complete } from './lib/core';
export type { CompleteOptions, CompleteResult } from './lib/types';

// Services
export { loadServices, listServices } from './lib/services';
export type { ServiceConfig } from './lib/types';

// Helpers (opt-in)
export { extractJson } from './lib/helpers';
export { isTruncated } from './lib/helpers';
export { updatePricing } from './lib/pricing';
```

### Usage Examples

```typescript
// Basic call — uses default_service from services.toml
import { complete } from 'llm-core';

const result = await complete({
  prompt: "Summarize this text: ...",
  model: "haiku",
  maxTokens: 1024,
});

console.log(result.text);       // raw model response
console.log(result.cost);       // estimated USD or null
console.log(result.durationMs); // how long it took
```

```typescript
// Explicit service — use work API key
import { complete } from 'llm-core';

const result = await complete({
  service: "anthropic-work",
  prompt: "Summarize this text: ...",
  model: "haiku",
  maxTokens: 1024,
});
```

```typescript
// With JSON extraction (opt-in helper)
import { complete, extractJson } from 'llm-core';

const result = await complete({
  prompt: "Score this artifact. Return JSON: {score: number, feedback: string}",
  model: "haiku",
  json: true,
});

const scores = extractJson<{ score: number; feedback: string }>(result.text);
```

```typescript
// Local model via MLX
import { complete } from 'llm-core';

const result = await complete({
  service: "mlx",
  prompt: "Quick local inference",
  model: "llama3",
});
```

```typescript
// Checking for truncation
import { complete, isTruncated } from 'llm-core';

const result = await complete({ prompt: longText, maxTokens: 256 });
if (isTruncated(result)) {
  console.warn("Response was cut off — consider increasing maxTokens");
}
```

## Package Structure

```
packages/llm-core/
├── index.ts                # Re-exports public API
├── cli.ts                  # Thin CLI wrapper (same pattern as all llmcli-tools)
├── lib/
│   ├── types.ts            # CompleteOptions, CompleteResult, ServiceConfig, provider types
│   ├── core.ts             # complete() function — service resolution + routing
│   ├── services.ts         # Service registry — load services.toml, defaults, resolution
│   ├── config.ts           # Config loading (wraps apiconf for credentials)
│   ├── retry.ts            # Retry logic — exponential backoff, transient error detection
│   ├── helpers.ts          # extractJson(), isTruncated()
│   ├── pricing.ts          # Cost estimation + updatePricing()
│   └── providers/
│       ├── anthropic.ts    # Raw fetch against Anthropic Messages API
│       ├── openai.ts       # Raw fetch against OpenAI Chat Completions API
│       └── ollama.ts       # Raw fetch against Ollama Generate API
├── package.json
└── tsconfig.json
```

### CLI

Thin wrapper following llmcli-tools pattern. Two modes:

```bash
# Send a prompt (for testing/debugging/agent use)
llm-core "test prompt" --service anthropic --model haiku --max-tokens 256

# Use a specific service (e.g., work key)
llm-core "test prompt" --service anthropic-work --model haiku

# Update local pricing data from LiteLLM community database
llm-core --update-pricing

# List configured services
llm-core --list-services
```

JSON output, exit codes (0/1/2), same as every other tool.

## Pricing Design

### Problem

No LLM provider returns cost in API responses. Cost = tokens x rate, but rates change and shouldn't be hardcoded in source.

### Solution

**Local pricing config file** at `~/.config/llm-core/pricing.toml`, populated by `updatePricing()`.

```toml
# ~/.config/llm-core/pricing.toml
# Auto-generated by: llm-core --update-pricing
# Source: LiteLLM community pricing database
# Last updated: 2026-02-13

[anthropic]
"claude-3-5-haiku" = { input_per_1m = 0.80, output_per_1m = 4.00 }
"claude-4-sonnet" = { input_per_1m = 3.00, output_per_1m = 15.00 }
"claude-4-opus" = { input_per_1m = 15.00, output_per_1m = 75.00 }

[openai]
"gpt-4o" = { input_per_1m = 2.50, output_per_1m = 10.00 }
"gpt-4o-mini" = { input_per_1m = 0.15, output_per_1m = 0.60 }

[ollama]
# Local models — zero cost
```

### updatePricing() Flow

1. Fetch LiteLLM's `model_prices_and_context_window.json` from GitHub
2. Filter to providers we support (anthropic, openai, ollama)
3. Transform to our TOML format
4. Write to `~/.config/llm-core/pricing.toml`
5. Return summary of models updated

### Cost Calculation

```typescript
function estimateCost(
  tokens: { input: number; output: number },
  model: string,
  provider: string
): number | null {
  const pricing = loadPricing();        // reads pricing.toml
  const rate = findRate(pricing, provider, model);  // fuzzy prefix match
  if (!rate) return null;               // unknown model = null, not error
  return (tokens.input * rate.input_per_1m + tokens.output * rate.output_per_1m) / 1_000_000;
}
```

Returns `null` for local models or anything not in the pricing file. Best-effort estimate, not a billing system.

## Retry Strategy

3 attempts total (1 initial + 2 retries). Exponential backoff: 1s → 2s → 4s.

**Retry on transient errors only:**
- `429` (rate limited)
- `500`, `502`, `503`, `504` (server errors)
- Network errors (DNS failure, connection refused, timeout)

**Fail fast on:**
- `400` (bad request — won't fix itself)
- `401`, `403` (auth errors — wrong key)
- `404` (wrong endpoint)

No jitter, no circuit breakers. This is a transport layer for batch calls, not a high-throughput queue.

## Dependencies

| Dependency | Purpose | Why |
|-----------|---------|-----|
| `apiconf` | Key/config management | Already built (v0.1.0), shared config layer |
| `smol-toml` | Parse pricing.toml | Transitive via apiconf, tiny |

**No provider SDKs.** All provider communication is raw `fetch()` (native in Bun). Each provider adapter is ~50-80 lines — just request shaping and response normalization.

## Provider Adapters

Each adapter implements a common interface:

```typescript
interface ProviderAdapter {
  complete(options: InternalCompleteOptions): Promise<RawProviderResponse>;
}
```

### Anthropic
- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Auth: `x-api-key` header
- Request: `{ model, max_tokens, messages: [{ role: "user", content }], system? }`
- Response normalization: `content[0].text`, `usage.input_tokens`, `stop_reason`

### OpenAI
- Endpoint: `POST https://api.openai.com/v1/chat/completions`
- Auth: `Authorization: Bearer` header
- Request: `{ model, max_tokens, messages: [{ role: "system"?, content }, { role: "user", content }] }`
- JSON mode: `response_format: { type: "json_object" }` when `json: true`
- Response normalization: `choices[0].message.content`, `usage.prompt_tokens`, `choices[0].finish_reason`

### Ollama
- Endpoint: `POST http://localhost:11434/api/generate` (or configured base URL)
- Auth: None (local)
- Request: `{ model, prompt, system?, options: { temperature?, num_predict? } }`
- Response normalization: `response`, `prompt_eval_count`, `eval_count`, `done_reason`

## Migration: llm-summarize

Once llm-core exists, llm-summarize gets refactored:

**What stays in llm-summarize:**
- Prompt building (quick mode, insights mode)
- Response parsing and JSON extraction (domain-specific)
- Session insight types (SessionInsights, Extraction, etc.)
- The `summarize()` public API

**What moves to llm-core:**
- Provider detection and routing
- API key loading and management
- HTTP request construction per provider
- Response normalization
- Error handling, retries, timeouts
- Config loading (`~/.config/llm/config.toml` → apiconf)

llm-summarize becomes a thin domain layer: build prompt → call `complete()` → parse result.

## Current State of Dependencies

### apiconf — BUILT (v0.1.0)

Location: `/Users/rudy/development/projects/apiconf/typescript/`

- `load(appName)`, `getKey()`, `getConfigPath()`, `loadConfig()`
- Provider registry: `PROVIDERS`, `getEnvVar()`, `isValidProvider()`, `listProviders()`
- Two-tier model: keys (credentials) + apps (profiles) in TOML
- ESM, TypeScript, smol-toml dependency
- Has dist/, tests, proper exports

**No longer blocked on apiconf. Use from day one.**

### llm-summarize — EXISTS, needs migration

Location: `/Users/rudy/development/projects/llmcli-tools/packages/llm-summarize/`

- Has baked-in provider logic (anthropic, openai, ollama) that should be extracted
- Has JSON extraction that handles markdown blocks, MLX tokens, thinking tags — stays here
- Config from `~/.config/llm/config.toml` — migrates to apiconf via llm-core

## Resolved Decisions

| Question | Decision | Date |
|----------|----------|------|
| CLI or library-only? | Both — thin CLI, same as all llmcli-tools | 2026-02-13 |
| apiconf before or after? | apiconf is built. Use from day one. | 2026-02-13 |
| extractJson in pipeline? | No. Opt-in helper export, never called by complete() | 2026-02-13 |
| Content interpretation? | No. text field returns exactly what model said. | 2026-02-13 |
| Provider SDKs? | No. Raw fetch() only. Minimal dependencies. | 2026-02-13 |
| Cost tracking? | Yes. Local pricing.toml, updatePricing() from LiteLLM DB | 2026-02-13 |
| LiteLLM vs custom? | Custom. TypeScript-only ecosystem, minimal deps. | 2026-02-13 |
| Standalone project? | No. Package under llmcli-tools monorepo. | 2026-02-13 |
| MLX handling? | OpenAI-compatible service — OpenAI adapter + local base URL. No new adapter. | 2026-02-14 |
| Retry strategy? | 3 attempts (1 + 2 retries), exponential backoff (1s/2s/4s), transient errors only (429, 5xx, network). Fail fast on 400/401/403. | 2026-02-14 |
| Streaming? | No. Not needed for current use cases. If ever needed, separate `stream()` export — not bolted onto `complete()`. | 2026-02-14 |
| Routing unit? | Named services, not providers. Services map to adapter + apiconf key + base URL. Supports multiple keys per provider. | 2026-02-14 |
| Hidden defaults? | No. Default services.toml written on first run. All routing config visible and editable. No hardcoded URLs in source. | 2026-02-14 |

## Open Questions

None — all design questions resolved. Ready for implementation.

## Key Insights

1. **Normalization is about the envelope, not the content** — Consistent response shape across providers. Content interpretation is the caller's job.

2. **Minimal deps != minimal quality** — Raw fetch instead of SDKs, but solid error handling, types, and reliability.

3. **Pricing is data, not code** — Rates live in a config file, updated from a community source. No hardcoded values, no stale-data bugs.

4. **Transport layer should be boring** — complete() does one thing predictably. No magic, no opinions, no surprises.

5. **The SDD motivation still holds** — Quality gates need cheap, fast, direct LLM calls. llm-core makes standing up new evaluation tools trivial.

6. **Services > providers** — The routing unit is a named service, not a provider. This naturally handles multiple keys, custom endpoints, and OpenAI-compatible servers without new adapter code.

7. **No hidden defaults** — If llm-core routes a request somewhere, you can see exactly where and why by reading a config file. Zero source-code spelunking required.

## Files / References

### Existing Code
- `/Users/rudy/development/projects/llmcli-tools/packages/llm-summarize/` — Provider logic to extract
- `/Users/rudy/development/projects/apiconf/typescript/` — Config layer (built, v0.1.0)

### External References
- [LiteLLM pricing database](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — Source for updatePricing()
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

### Related Explorations
- `[[llmconf/apiconf-pivot]]` — Two-tier config design (now built)
- `[[momentum/specflow-momentum-integration]]` — SDD quality gates motivation
- `[[sable/spec-driven-verification]]` — Mechanical vs evaluative verification layers
