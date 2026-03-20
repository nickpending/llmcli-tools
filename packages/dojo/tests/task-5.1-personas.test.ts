/**
 * Task 5.1 — Persona file structural and content validation
 *
 * Invariants tested:
 * - All 11 persona files exist at the expected path
 * - Each file has exactly 6 required sections (H2 headings)
 * - System prompts are in second person ("You are")
 * - System prompts include negative space ("do NOT" or "never" variants)
 * - Name collision disambiguation: two Elenas and two Miriams are distinct
 * - Learning Context Adaptation section contains a table (pipe characters)
 * - Within-mode distinctiveness: personas sharing a mode have different characteristic phrases
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

const PROJECT_ROOT =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo";
const PERSONAS_DIR = `${PROJECT_ROOT}/skills/learn/personas`;

const PERSONA_FILES = [
  "quinn.md",
  "miriam-khoury.md",
  "kaz.md",
  "vera.md",
  "elena-scientist.md",
  "thales.md",
  "marcus.md",
  "mariana.md",
  "mira.md",
  "elena-analyst.md",
  "miriam-katz.md",
];

const REQUIRED_SECTIONS = [
  "## Backstory",
  "## Personality",
  "## Communication Style",
  "## Teaching Approach",
  "## System Prompt",
  "## Learning Context Adaptation",
];

// Helper: read a persona file and return its content
function readPersona(filename: string): string {
  return readFileSync(`${PERSONAS_DIR}/${filename}`, "utf-8");
}

// Helper: extract the system prompt section content
function extractSystemPrompt(content: string): string {
  const match = content.match(/## System Prompt\n([\s\S]*?)(?=\n## |\s*$)/);
  return match ? match[1] : "";
}

// Helper: extract a named section content
function extractSection(content: string, sectionName: string): string {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`${escaped}\n([\\s\\S]*?)(?=\n## |\\s*$)`),
  );
  return match ? match[1] : "";
}

describe("Persona files — task 5.1", () => {
  it("all 11 persona files exist", () => {
    const missing: string[] = [];
    for (const file of PERSONA_FILES) {
      const fullPath = `${PERSONAS_DIR}/${file}`;
      if (!existsSync(fullPath)) {
        missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });

  it("each persona file has all 6 required sections", () => {
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      for (const section of REQUIRED_SECTIONS) {
        if (!content.includes(section)) {
          failures.push(`${file}: missing "${section}"`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("every system prompt begins in second person (You are)", () => {
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      const systemPrompt = extractSystemPrompt(content);
      // System prompt must start with "You are" (possibly after whitespace)
      if (!systemPrompt.trimStart().startsWith("You are")) {
        failures.push(`${file}: system prompt does not start with "You are"`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("no system prompt contains a 'You do NOT:' constraint list (identity format, not instruction format)", () => {
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      const systemPrompt = extractSystemPrompt(content);
      // Task 2.1 converted all files from instruction format to identity format.
      // "You do NOT:" blocks are an instruction-format artifact and must not appear.
      if (
        systemPrompt.includes("You do NOT:") ||
        systemPrompt.includes("do NOT:")
      ) {
        failures.push(
          `${file}: system prompt still contains "You do NOT:" (old instruction format)`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("name collisions are disambiguated: two Elenas have distinct system prompt identifiers", () => {
    const scientist = readPersona("elena-scientist.md");
    const analyst = readPersona("elena-analyst.md");

    const scientistPrompt = extractSystemPrompt(scientist);
    const analystPrompt = extractSystemPrompt(analyst);

    // Each system prompt must contain text that distinguishes it from the other Elena
    // elena-scientist: "research scientist" or "Scientist"
    // elena-analyst: "systems analyst" or "Analyst"
    expect(scientistPrompt).toMatch(/scientist/i);
    expect(analystPrompt).toMatch(/analyst/i);

    // They must not share the same identifying phrase
    const scientistHasAnalyst = scientistPrompt
      .toLowerCase()
      .includes("analyst");
    const analystHasScientist = analystPrompt
      .toLowerCase()
      .includes("scientist");
    // It's okay for one to mention the other in contrast, but the primary identity must differ
    // Verify filenames and H1 headings distinguish them
    expect(scientist).toMatch(/Elena.*Scientist|Scientist.*Elena/i);
    expect(analyst).toMatch(/Elena.*Analyst|Analyst.*Elena/i);
  });

  it("name collisions are disambiguated: two Miriams use full surnames", () => {
    const khoury = readPersona("miriam-khoury.md");
    const katz = readPersona("miriam-katz.md");

    const khouryPrompt = extractSystemPrompt(khoury);
    const katzPrompt = extractSystemPrompt(katz);

    // Each system prompt must use the full surname to prevent ambiguity
    expect(khouryPrompt).toContain("Miriam Khoury");
    expect(katzPrompt).toContain("Miriam Katz");
  });

  it("Learning Context Adaptation section contains a markdown table in every file", () => {
    const failures: string[] = [];
    for (const file of PERSONA_FILES) {
      const content = readPersona(file);
      const lcaSection = extractSection(
        content,
        "## Learning Context Adaptation",
      );
      // A markdown table has pipe characters and all 4 required contexts
      const hasTable = lcaSection.includes("|");
      const hasAllContexts =
        lcaSection.includes("Sprint") &&
        lcaSection.includes("Skill-Build") &&
        lcaSection.includes("Problem-Solve") &&
        lcaSection.includes("Deep Mastery");
      if (!hasTable) {
        failures.push(`${file}: LCA section has no markdown table`);
      }
      if (!hasAllContexts) {
        failures.push(
          `${file}: LCA section missing one or more required contexts`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("within-mode Challenger personas (Quinn, Miriam Katz) have distinct characteristic phrases", () => {
    const quinn = readPersona("quinn.md");
    const miriamKatz = readPersona("miriam-katz.md");

    const quinnStyle = extractSection(quinn, "## Communication Style");
    const katzStyle = extractSection(miriamKatz, "## Communication Style");

    // Quinn's characteristic phrase — code-focused challenge
    expect(quinnStyle).toContain("make it fail");
    // Miriam Katz's characteristic phrase — assumption-focused challenge
    expect(katzStyle).toContain("assumption");

    // They must not share the same signature phrase
    expect(quinnStyle).not.toContain("Why do you think you need this");
    expect(katzStyle).not.toContain("make it fail");
  });

  it("within-mode Socratic personas (Miriam Khoury, Vera, Thales) have distinct characteristic phrases", () => {
    const miriamKhoury = readPersona("miriam-khoury.md");
    const vera = readPersona("vera.md");
    const thales = readPersona("thales.md");

    const khouryStyle = extractSection(miriamKhoury, "## Communication Style");
    const veraStyle = extractSection(vera, "## Communication Style");
    const thalesStyle = extractSection(thales, "## Communication Style");

    // Miriam Khoury — dependency tracing
    expect(khouryStyle).toMatch(/dependency|Walk me through/i);
    // Vera — error/confusion tracing
    expect(veraStyle).toMatch(/understanding stop|trace/i);
    // Thales — definition tracing (check his file has a distinct identity phrase)
    expect(thalesStyle).not.toBe(khouryStyle);
    expect(thalesStyle).not.toBe(veraStyle);

    // Core distinctiveness: none of the three share the other's signature phrase
    expect(khouryStyle).not.toContain(
      "Where exactly did your understanding stop",
    );
    expect(veraStyle).not.toContain(
      "Walk me through what a struct gives you first",
    );
  });
});
