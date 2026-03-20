/**
 * Task 2.1 — Persona identity format adaptation validation
 *
 * Invariants tested (INV-005: Persona Identity Persistence — design-time file check):
 * - "You do NOT:" instruction blocks removed from all 11 System Prompt sections
 * - "Break character or reference being an AI" phrase absent from all 11 files (omitted per spec)
 * - "Use these phrases naturally in conversation:" block preserved in all 11 System Prompts
 * - "Every response sounds like [Name]" identity closing present in all 11 System Prompts
 * - Learning Context Adaptation tables intact (all 4 rows: Sprint, Skill-Build, Problem-Solve, Deep Mastery)
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

const PERSONAS_DIR =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo/skills/learn/personas";

const PERSONA_FILES = [
  "marcus.md",
  "miriam-khoury.md",
  "quinn.md",
  "kaz.md",
  "vera.md",
  "elena-scientist.md",
  "elena-analyst.md",
  "thales.md",
  "mariana.md",
  "mira.md",
  "miriam-katz.md",
];

function readPersona(filename: string): string {
  return readFileSync(`${PERSONAS_DIR}/${filename}`, "utf-8");
}

function extractSystemPrompt(content: string): string {
  const match = content.match(/## System Prompt\n([\s\S]*?)(?=\n## |\s*$)/);
  return match ? match[1] : "";
}

describe("Persona identity format — task 2.1", () => {
  it("no System Prompt section contains a 'You do NOT:' constraint list", () => {
    // HIGH RISK: "You do NOT:" blocks are the pre-task-2.1 instruction format.
    // Their presence means the conversion failed for that file.
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      const systemPrompt = extractSystemPrompt(content);
      if (
        systemPrompt.includes("You do NOT:") ||
        systemPrompt.includes("do NOT:")
      ) {
        failures.push(
          `${file}: system prompt still contains "You do NOT:" block`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("'Break character or reference being an AI' is absent from all files", () => {
    // HIGH RISK: This phrase is an instruction-format artifact that must be omitted
    // entirely (not rewritten positively) per the task spec. Its presence means
    // the identity format conversion is incomplete.
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      if (content.includes("Break character")) {
        failures.push(
          `${file}: contains "Break character" (must be omitted entirely)`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("'Use these phrases naturally in conversation:' block preserved in all System Prompts", () => {
    // MEDIUM RISK: Natural phrases block provides concrete behavioral anchors.
    // Task spec explicitly marks this as a keeper — removing it degrades persona distinctiveness.
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      const systemPrompt = extractSystemPrompt(content);
      if (
        !systemPrompt.includes("Use these phrases naturally in conversation:")
      ) {
        failures.push(
          `${file}: natural phrases block missing from System Prompt`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("identity closing statement 'Every response sounds like' present in all System Prompts", () => {
    // HIGH RISK: The identity closing is the affirmative reformulation of the old
    // "Maintain this voice consistently" instruction. Its absence means the
    // conversion is incomplete — no persistent voice anchor for the model.
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      const systemPrompt = extractSystemPrompt(content);
      if (!systemPrompt.includes("Every response sounds like")) {
        failures.push(
          `${file}: missing identity closing "Every response sounds like"`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("Learning Context Adaptation tables have all 4 required contexts in all files", () => {
    // MEDIUM RISK: LCA table controls coaching behavior per session type. Missing rows
    // mean the persona behaves incorrectly for that learning context.
    const requiredContexts = [
      "Sprint",
      "Skill-Build",
      "Problem-Solve",
      "Deep Mastery",
    ];
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      for (const ctx of requiredContexts) {
        if (!content.includes(ctx)) {
          failures.push(`${file}: LCA table missing context "${ctx}"`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
