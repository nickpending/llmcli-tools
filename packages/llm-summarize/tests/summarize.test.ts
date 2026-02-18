/**
 * tests/summarize.test.ts
 *
 * Tests for llm-summarize after migration to llm-core transport.
 *
 * Strategy: mock @voidwire/llm-core at the package boundary before
 * importing index.ts. This is safe because:
 *   - llm-core's own tests never mock "@voidwire/llm-core"
 *   - No local file paths are mocked (no Bun module cache leakage risk)
 *   - index.ts has no module-level I/O, so no "os"/"fs" mocks needed
 *
 * Invariants protected:
 *   INV-005: summarize() accepts same inputs, returns same output shape
 *   Token mapping: result.tokens.output → tokens_used (not swapped)
 *   complete() called with correct args (service, model, prompt, systemPrompt, maxTokens, temperature)
 *   complete() throws → summarize returns { error } (no rethrow)
 *   extractJson failure → { error, rawText } with rawText preserved verbatim
 *   Missing model guard fires before complete() is called
 *   loadConfig() returns sensible defaults
 *   extractJson domain logic: thinking blocks, MLX tokens, markdown code blocks
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { join } from "path";

// ---------------------------------------------------------------------------
// Track complete() calls for argument inspection
// ---------------------------------------------------------------------------

let completeCalls: Array<Record<string, unknown>> = [];
let completeImpl: () => Promise<unknown> = async () => {
  throw new Error("complete() not configured for this test");
};

// Mock @voidwire/llm-core BEFORE importing index.ts
mock.module("@voidwire/llm-core", () => ({
  complete: async (opts: Record<string, unknown>) => {
    completeCalls.push(opts);
    return completeImpl();
  },
}));

// Import index.ts AFTER mock is registered
const { summarize, loadConfig } = await import(
  join(import.meta.dir, "../index.ts")
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal CompleteResult that summarize() expects */
function makeCompleteResult(overrides: Record<string, unknown> = {}) {
  return {
    text: '{"summary":"User is testing things","should_search":false,"extractions":[]}',
    model: "claude-3-5-haiku-20241022",
    provider: "anthropic",
    tokens: { input: 100, output: 42 },
    finishReason: "stop",
    durationMs: 123,
    cost: 0.001,
    ...overrides,
  };
}

/** A SummarizeConfig that matches what loadConfig() returns */
function defaultConfig() {
  return { model: "claude-3-5-haiku-20241022", maxTokens: 1024 };
}

beforeEach(() => {
  completeCalls = [];
  completeImpl = async () => {
    throw new Error("complete() not configured for this test");
  };
});

// ---------------------------------------------------------------------------
// INV-005: SummarizeResult output shape (happy path)
// ---------------------------------------------------------------------------

describe("summarize() output shape (INV-005)", () => {
  it("returns insights, rawText, model, tokens_used on success", async () => {
    const rawJson =
      '{"summary":"User is testing things","should_search":false,"extractions":[]}';
    completeImpl = async () => makeCompleteResult({ text: rawJson });

    const result = await summarize("some text", defaultConfig());

    // All four fields must be present
    expect(result.insights).toBeDefined();
    expect(result.insights?.summary).toBe("User is testing things");
    expect(result.rawText).toBe(rawJson);
    expect(result.model).toBe("claude-3-5-haiku-20241022");
    expect(result.tokens_used).toBeDefined();
    // No error on success
    expect(result.error).toBeUndefined();
  });

  it("tokens_used maps from result.tokens.output — not tokens.input", async () => {
    // tokens.input=500, tokens.output=42 — tokens_used must be 42, not 500
    completeImpl = async () =>
      makeCompleteResult({ tokens: { input: 500, output: 42 } });

    const result = await summarize("some text", defaultConfig());

    expect(result.tokens_used).toBe(42); // must not be 500
  });
});

// ---------------------------------------------------------------------------
// complete() called with correct arguments
// ---------------------------------------------------------------------------

describe("summarize() delegates correct args to complete()", () => {
  it("passes service, model, prompt, systemPrompt, maxTokens, temperature=0.3", async () => {
    const rawJson = '{"summary":"Test summary"}';
    completeImpl = async () => makeCompleteResult({ text: rawJson });

    const config = {
      service: "my-service",
      model: "claude-3-5-haiku-20241022",
      maxTokens: 2048,
    };
    await summarize("the prompt text", config, { mode: "quick" });

    expect(completeCalls.length).toBe(1);
    const call = completeCalls[0];
    expect(call.service).toBe("my-service");
    expect(call.model).toBe("claude-3-5-haiku-20241022");
    expect(call.prompt).toBe("the prompt text");
    expect(typeof call.systemPrompt).toBe("string"); // mode-based prompt
    expect(call.maxTokens).toBe(2048);
    expect(call.temperature).toBe(0.3); // always fixed at 0.3
  });

  it("options.model overrides config.model", async () => {
    const rawJson = '{"summary":"Override test"}';
    completeImpl = async () =>
      makeCompleteResult({ text: rawJson, model: "gpt-4o" });

    await summarize("text", defaultConfig(), { model: "gpt-4o" });

    expect(completeCalls[0].model).toBe("gpt-4o");
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("summarize() error handling", () => {
  it("complete() throws → returns { error } without rethrowing", async () => {
    completeImpl = async () => {
      throw new Error("API rate limit exceeded (429)");
    };

    const result = await summarize("some text", defaultConfig());

    expect(result.error).toBe("API rate limit exceeded (429)");
    expect(result.insights).toBeUndefined();
    // Error case: no crash, no rethrow
  });

  it("extractJson failure → returns { error, rawText } with verbatim rawText", async () => {
    // Return text that is not valid JSON with a summary field
    const badText = "Sorry, I cannot process this request.";
    completeImpl = async () => makeCompleteResult({ text: badText });

    const result = await summarize("some text", defaultConfig());

    expect(result.error).toBe("Failed to parse insights from response");
    expect(result.rawText).toBe(badText); // verbatim, not trimmed or modified
    expect(result.insights).toBeUndefined();
  });

  it("missing model → passes through to complete() which resolves from service default_model", async () => {
    completeImpl = async () => makeCompleteResult();

    // No model in config, no model in options — llm-core resolves from default_model
    const result = await summarize("some text", { maxTokens: 1024 });

    // Should not error at the summarize layer — llm-core handles model resolution
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loadConfig() defaults
// ---------------------------------------------------------------------------

describe("loadConfig() defaults", () => {
  it("returns maxTokens with sensible value; model and service are undefined (resolved by llm-core)", () => {
    const config = loadConfig();

    expect(typeof config.maxTokens).toBe("number");
    expect(config.maxTokens).toBeGreaterThan(0);
    // model and service are undefined — llm-core resolves from services.toml
    expect(config.model).toBeUndefined();
    expect(config.service).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractJson domain logic (pure function, no complete() needed)
// ---------------------------------------------------------------------------

describe("extractJson domain logic (via summarize)", () => {
  it("strips <think>...</think> blocks before parsing JSON", async () => {
    const textWithThinking =
      "<think>Let me analyze this...</think>\n" +
      '{"summary":"Cleaned output","should_search":false,"extractions":[]}';
    completeImpl = async () => makeCompleteResult({ text: textWithThinking });

    const result = await summarize("text", defaultConfig());

    expect(result.insights?.summary).toBe("Cleaned output");
    expect(result.error).toBeUndefined();
  });

  it("strips MLX end tokens and parses JSON", async () => {
    const textWithMlx =
      '{"summary":"MLX output","should_search":false,"extractions":[]}<|im_end|>';
    completeImpl = async () => makeCompleteResult({ text: textWithMlx });

    const result = await summarize("text", defaultConfig());

    expect(result.insights?.summary).toBe("MLX output");
    expect(result.error).toBeUndefined();
  });

  it("extracts JSON from markdown code blocks", async () => {
    const textWithCodeBlock =
      "```json\n" +
      '{"summary":"Markdown wrapped","should_search":true,"extractions":[]}\n' +
      "```";
    completeImpl = async () => makeCompleteResult({ text: textWithCodeBlock });

    const result = await summarize("text", defaultConfig());

    expect(result.insights?.summary).toBe("Markdown wrapped");
    expect(result.error).toBeUndefined();
  });
});
