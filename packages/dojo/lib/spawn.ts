import { readFileSync, writeFileSync, chmodSync, existsSync } from "fs";
import { homedir } from "os";
import { listDomains, readDomain } from "./state";
import { getDueConcepts } from "./fsrs";
import type { DueConcept } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface SpawnResult {
  domain: string;
  persona: string;
  personaDisplayName: string;
  scriptPath: string;
  spawnMethod: "ghostty" | "terminal" | "script-only";
}

// ============================================================================
// Domain Resolution (fuzzy substring match)
// ============================================================================

export function resolveDomain(input: string): string {
  const domains = listDomains();
  const exact = domains.find((d) => d === input);
  if (exact) return exact;

  const matches = domains.filter((d) => d.includes(input));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    const available = domains.length > 0 ? domains.join(", ") : "(none)";
    throw new Error(
      `No domain matching "${input}". Available domains: ${available}`,
    );
  }
  throw new Error(
    `Ambiguous domain "${input}" — matches: ${matches.join(", ")}. Be more specific.`,
  );
}

// ============================================================================
// Persona Extraction
// ============================================================================

export function extractPersonaIdentity(content: string): string {
  const match = content.match(/## System Prompt\n([\s\S]*?)(?=\n## |\s*$)/);
  if (!match) {
    throw new Error(
      "Could not extract System Prompt section from persona file",
    );
  }
  return match[1].trim();
}

export function extractPersonaDisplayName(content: string): string {
  const match = content.match(/^# (.+?)(?:\s*—|\s*$)/m);
  if (!match) {
    throw new Error("Could not extract display name from persona file H1");
  }
  return match[1].trim();
}

// ============================================================================
// Concept Queue Formatting
// ============================================================================

export function buildConceptQueue(concepts: DueConcept[]): string {
  if (concepts.length === 0) {
    return "No concepts due — all caught up or domain has no concepts yet.";
  }
  return concepts
    .map((c) => {
      const stateLabel = c.state === 0 ? "new" : "review";
      return `- [${c.title}] (state: ${stateLabel}, mastery: ${c.mastery})`;
    })
    .join("\n");
}

// ============================================================================
// Lore Context
// ============================================================================

function getLoreContext(domain: string): string {
  try {
    const result = Bun.spawnSync(
      ["lore", "search", "--source=teachings", domain, "--limit=3"],
      { stderr: "pipe" },
    );
    if (result.exitCode !== 0 || !result.stdout) return "none";
    const text = result.stdout.toString().trim();
    return text.length > 0 ? text : "none";
  } catch {
    return "none";
  }
}

// ============================================================================
// Prompt Assembly
// ============================================================================

export function assemblePrompt(
  template: string,
  personaIdentity: string,
  frameworkContent: string,
  guardsContent: string,
  domainName: string,
  learningContext: string,
  conceptQueue: string,
  loreContext: string,
): string {
  let result = template;

  // Strip the HTML comment block at the top (variable slots canonical reference)
  result = result.replace(/\n*<!--[\s\S]*?-->\n*/, "");

  // Inline embedded content FIRST — framework and guards may contain {{VARIABLE}} slots
  // that need to be resolved in the next pass (e.g., guards.md references {{LORE_CONTEXT}})
  result = result.replace(
    "<!-- FRAMEWORK_CONTENT_EMBEDDED_HERE: read coaching/framework.md and inline all content at this position -->",
    frameworkContent,
  );
  result = result.replace(
    "<!-- GUARDS_CONTENT_EMBEDDED_HERE: read coaching/guards.md and inline all content at this position -->",
    guardsContent,
  );

  // Variable slot substitutions (after inlining, so slots inside guards/framework resolve)
  result = result.replaceAll("{{PERSONA_IDENTITY}}", personaIdentity);
  result = result.replaceAll("{{DOMAIN_NAME}}", domainName);
  result = result.replaceAll("{{LEARNING_CONTEXT}}", learningContext);
  result = result.replaceAll("{{CONCEPT_QUEUE}}", conceptQueue);
  result = result.replaceAll("{{LORE_CONTEXT}}", loreContext);

  return result;
}

// ============================================================================
// Main: spawnSession
// ============================================================================

export function spawnSession(domainInput: string): SpawnResult {
  // a. Domain resolution (fuzzy)
  const domain = resolveDomain(domainInput);

  // b. Read domain state
  const state = readDomain(domain);
  const persona = state.persona;
  const context = state.context;

  // c. Read persona file + extract System Prompt and display name
  const skillsPath = `${homedir()}/.claude/skills/learn`;
  const personaPath = `${skillsPath}/personas/${persona}.md`;
  if (!existsSync(personaPath)) {
    throw new Error(
      `Persona file not found: ${personaPath}. Run 'dojo init' to install skill files.`,
    );
  }
  const personaContent = readFileSync(personaPath, "utf-8");
  const personaIdentity = extractPersonaIdentity(personaContent);
  const personaDisplayName = extractPersonaDisplayName(personaContent);

  // d. Read framework.md
  const frameworkPath = `${skillsPath}/coaching/framework.md`;
  if (!existsSync(frameworkPath)) {
    throw new Error(
      `Framework file not found: ${frameworkPath}. Run 'dojo init' to install skill files.`,
    );
  }
  const frameworkContent = readFileSync(frameworkPath, "utf-8");

  // e. Read prompt-template.md
  const templatePath = `${skillsPath}/coaching/prompt-template.md`;
  if (!existsSync(templatePath)) {
    throw new Error(
      `Prompt template not found: ${templatePath}. Run 'dojo init' to install skill files.`,
    );
  }
  const templateContent = readFileSync(templatePath, "utf-8");

  // f. Read guards.md
  const guardsPath = `${skillsPath}/coaching/guards.md`;
  if (!existsSync(guardsPath)) {
    throw new Error(
      `Guards file not found: ${guardsPath}. Run 'dojo init' to install skill files.`,
    );
  }
  const guardsContent = readFileSync(guardsPath, "utf-8");

  // g. Get due concepts + format
  const dueConcepts = getDueConcepts(domain);
  const conceptQueue = buildConceptQueue(dueConcepts);

  // h. Get lore context
  const loreContext = getLoreContext(domain);

  // i. Assemble prompt
  const assembledPrompt = assemblePrompt(
    templateContent,
    personaIdentity,
    frameworkContent,
    guardsContent,
    domain,
    context,
    conceptQueue,
    loreContext,
  );

  // j. Write prompt file (plain text — no shell escaping needed)
  const promptPath = `/tmp/dojo-prompt-${domain}.txt`;
  writeFileSync(promptPath, assembledPrompt, "utf-8");

  // k. Write spawn script (reads prompt from file)
  const safeName = personaDisplayName.replace(/"/g, '\\"');
  const scriptPath = `/tmp/dojo-spawn-${domain}.sh`;
  const scriptContent = `#!/bin/bash
cd "$HOME/.claude/skills/learn"
PROMPT=$(cat "/tmp/dojo-prompt-${domain}.txt")
claude --system-prompt "$PROMPT" --name "Dojo: ${safeName} — ${domain}"
`;
  writeFileSync(scriptPath, scriptContent, "utf-8");
  chmodSync(scriptPath, 0o755);

  // l. Spawn terminal
  let spawnMethod: SpawnResult["spawnMethod"] = "script-only";

  // Try Ghostty first with -F flag (prevents session restore)
  const ghosttyResult = Bun.spawnSync(
    [
      "open",
      "-n",
      "-a",
      "/Applications/Ghostty.app",
      "-F",
      "--args",
      "-e",
      "bash",
      scriptPath,
    ],
    { stderr: "pipe" },
  );

  if (ghosttyResult.exitCode === 0) {
    spawnMethod = "ghostty";
  } else {
    // Fall back to Terminal
    const terminalResult = Bun.spawnSync(
      ["open", "-a", "Terminal", scriptPath],
      { stderr: "pipe" },
    );
    if (terminalResult.exitCode === 0) {
      spawnMethod = "terminal";
    }
  }

  return {
    domain,
    persona,
    personaDisplayName,
    scriptPath,
    spawnMethod,
  };
}
