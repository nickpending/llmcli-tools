/**
 * Task 2.1 — Lesson plan glue block: structural and content validation
 *
 * This is a markdown content change to coaching/prompt-template.md.
 * Tests verify position, slot references, branch conditions, and graceful
 * failure behavior in the Lesson Plans glue block added by task 2.1.
 *
 * Invariants protected:
 * - SLOT-IN-GLUE: {{DOMAIN_NAME}} and {{LEARNING_CONTEXT}} appear inside the glue block
 *   (assemblePrompt must resolve them — if absent, lesson paths contain literal tokens)
 * - GLUE-POSITION: "Lesson Plans" block appears after {{CONCEPT_QUEUE}} and before {{LORE_CONTEXT}}
 *   (glue references plan status from the queue; must be sequenced correctly)
 * - BRANCH-CONDITIONS: both [plan: exists at <path>] and [plan: none] cases are named
 *   (if either is absent, the coaching session has no instruction for that case)
 * - GRACEFUL-FAILURE: Write tool failure instruction present
 *   (without it, a filesystem error interrupts the coaching flow)
 * - LESSON-STRUCTURE: required frontmatter fields and section headings present in the embedded template
 *   (if structure diverges from task 1.1 spec, generated plans will be malformed)
 *
 * Note: Slot presence tests (all 5 slots in template body) and embedding markers are
 * already protected by task-3.1-coaching-prompt-guards.test.ts — not duplicated here.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

const TEMPLATE_FILE =
  "/Users/rudy/development/projects/llmcli-tools/packages/dojo/skills/learn/coaching/prompt-template.md";

function readTemplate(): string {
  return readFileSync(TEMPLATE_FILE, "utf-8");
}

/**
 * Extract the Lesson Plans glue block from the template.
 * Returns content between "**Lesson Plans:**" and "**Prior session context (Lore):**"
 */
function extractGlueBlock(content: string): string | null {
  const match = content.match(
    /\*\*Lesson Plans:\*\*([\s\S]*?)(?=\*\*Prior session context)/,
  );
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// SLOT-IN-GLUE — {{DOMAIN_NAME}} and {{LEARNING_CONTEXT}} inside the glue block
// ---------------------------------------------------------------------------

describe("Slot references inside glue block — task 2.1", () => {
  it("{{DOMAIN_NAME}} appears inside the Lesson Plans glue block", () => {
    // HIGH RISK: The glue block constructs lesson plan paths using {{DOMAIN_NAME}}.
    // If this slot is absent from the block, assemblePrompt resolves nothing
    // and the coaching session gets a literal "{{DOMAIN_NAME}}" in path instructions.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();
    expect(glue!).toContain("{{DOMAIN_NAME}}");
  });

  it("{{LEARNING_CONTEXT}} appears inside the Lesson Plans glue block", () => {
    // HIGH RISK: The lesson plan frontmatter includes learning_context — the coaching
    // session must use {{LEARNING_CONTEXT}} to populate it. If absent, the generated
    // frontmatter will have a literal placeholder token.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();
    expect(glue!).toContain("{{LEARNING_CONTEXT}}");
  });
});

// ---------------------------------------------------------------------------
// GLUE-POSITION — block comes after CONCEPT_QUEUE and before LORE_CONTEXT
// ---------------------------------------------------------------------------

describe("Glue block position in template — task 2.1", () => {
  it("Lesson Plans block appears after {{CONCEPT_QUEUE}} in the template", () => {
    // HIGH RISK: The glue block references "[plan: exists at <path>]" and "[plan: none]"
    // status tags that come from the concept queue. If it precedes the queue, the model
    // reads instructions before seeing the data they reference.
    const content = readTemplate();
    const conceptQueuePos = content.indexOf("{{CONCEPT_QUEUE}}");
    const lessonPlansPos = content.indexOf("**Lesson Plans:**");
    expect(conceptQueuePos).toBeGreaterThan(-1);
    expect(lessonPlansPos).toBeGreaterThan(-1);
    expect(lessonPlansPos).toBeGreaterThan(conceptQueuePos);
  });

  it("Lesson Plans block appears before {{LORE_CONTEXT}} in the template", () => {
    // HIGH RISK: Section ordering in the assembled prompt determines model attention.
    // Lore context (prior session narrative) must follow — not interrupt — the
    // concept+lesson-plan block. If ordering is inverted, the model sees lore
    // before understanding what concepts it's teaching this session.
    const content = readTemplate();
    const lessonPlansPos = content.indexOf("**Lesson Plans:**");
    const loreContextPos = content.lastIndexOf("{{LORE_CONTEXT}}");
    expect(lessonPlansPos).toBeGreaterThan(-1);
    expect(loreContextPos).toBeGreaterThan(-1);
    expect(lessonPlansPos).toBeLessThan(loreContextPos);
  });
});

// ---------------------------------------------------------------------------
// BRANCH-CONDITIONS — both [plan: exists] and [plan: none] cases named
// ---------------------------------------------------------------------------

describe("Branch conditions in glue block — task 2.1", () => {
  it("glue block names the [plan: exists at <path>] case", () => {
    // HIGH RISK: Without this branch, the coaching session has no instruction
    // for what to do when a lesson plan already exists — it would either skip
    // reading the plan or hallucinate behavior.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();
    expect(glue!).toMatch(/\[plan: exists/);
  });

  it("glue block names the [plan: none] case", () => {
    // HIGH RISK: Without this branch, the coaching session has no instruction
    // for generating new plans. The entire lesson-plan creation path fails silently.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();
    expect(glue!).toMatch(/\[plan: none\]/);
  });
});

// ---------------------------------------------------------------------------
// GRACEFUL-FAILURE — Write tool failure must not interrupt coaching flow
// ---------------------------------------------------------------------------

describe("Graceful failure instruction — task 2.1", () => {
  it("glue block instructs session to continue if Write tool fails", () => {
    // HIGH RISK: Without this instruction, a filesystem error (disk full, permission)
    // will cause the coaching session to halt or panic mid-session. The invariant is:
    // lesson plan saving is best-effort, coaching continuity is the priority.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();
    // Must explicitly name Write tool failure and mandate session continuation
    expect(glue!).toMatch(/Write tool fails?/i);
    expect(glue!).toMatch(/[Cc]ontinue/);
  });
});

// ---------------------------------------------------------------------------
// LESSON-STRUCTURE — embedded template must match task 1.1 spec structure
// ---------------------------------------------------------------------------

describe("Embedded lesson plan structure — task 2.1", () => {
  it("lesson plan template in glue block contains all required frontmatter fields", () => {
    // MEDIUM RISK: If the embedded template diverges from task 1.1's defined structure,
    // generated plans will be malformed — lesson get and future plan reads will fail
    // or produce incomplete data.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();

    // Extract only fenced code blocks to avoid false positives from prose text
    const codeBlocks = glue!.match(/```[\s\S]*?```/g) ?? [];
    const codeContent = codeBlocks.join("\n");

    const requiredFrontmatter = [
      "concept:",
      "domain:",
      "learning_context:",
      "created:",
      "updated:",
    ];
    const missingFields: string[] = [];
    for (const field of requiredFrontmatter) {
      if (!codeContent.includes(field)) {
        missingFields.push(field);
      }
    }
    expect(missingFields).toEqual([]);
  });

  it("lesson plan template in glue block contains all required section headings", () => {
    // MEDIUM RISK: Missing section headings mean generated plans are structurally
    // incomplete — follow-on features (task 3.1 plan status, future plan readers)
    // expect all five sections to be present.
    const content = readTemplate();
    const glue = extractGlueBlock(content);
    expect(glue).not.toBeNull();

    const codeBlocks = glue!.match(/```[\s\S]*?```/g) ?? [];
    const codeContent = codeBlocks.join("\n");

    const requiredSections = [
      "## Core Idea",
      "## Key Resource",
      "## Structural Relationships",
      "## Practice Seed",
      "## Prior Session Notes",
    ];
    const missingSections: string[] = [];
    for (const section of requiredSections) {
      if (!codeContent.includes(section)) {
        missingSections.push(section);
      }
    }
    expect(missingSections).toEqual([]);
  });
});
