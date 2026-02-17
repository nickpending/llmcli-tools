/**
 * lib/providers/anthropic.ts - Anthropic Messages API adapter
 *
 * Converts AdapterRequest to Anthropic's /messages endpoint format
 * and normalizes the response into AdapterResponse.
 *
 * Reference: packages/llm-summarize/index.ts callAnthropic()
 */

import type { AdapterRequest, AdapterResponse } from "../types";

export async function complete(req: AdapterRequest): Promise<AdapterResponse> {
  const body = {
    model: req.model,
    max_tokens: req.maxTokens || 4096,
    messages: [{ role: "user", content: req.prompt }],
    ...(req.systemPrompt && { system: req.systemPrompt }),
    ...(req.temperature !== undefined && { temperature: req.temperature }),
  };

  const response = await fetch(`${req.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  // Map stop_reason to normalized finishReason
  let finishReason: "stop" | "max_tokens" | "error" = "stop";
  if (data.stop_reason === "max_tokens" || data.stop_reason === "end_turn") {
    finishReason = data.stop_reason === "max_tokens" ? "max_tokens" : "stop";
  }

  return {
    text: data.content[0].text, // INV-001: verbatim extraction
    model: data.model,
    tokensInput: data.usage.input_tokens,
    tokensOutput: data.usage.output_tokens,
    finishReason,
  };
}
