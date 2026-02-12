/**
 * lib/types.ts - Core type definitions for lore
 */

/**
 * Capture type vocabulary
 * Single source of truth for --type filter validation
 */
export enum LoreType {
  Gotcha = "gotcha",
  Decision = "decision",
  Pattern = "pattern",
  Learning = "learning",
  Preference = "preference",
  Term = "term",
  Style = "style",
  Teaching = "teaching",
  Task = "task",
  Todo = "todo",
  Idea = "idea",
}

/**
 * Valid type values for runtime checking
 */
export const LORE_TYPES = Object.values(LoreType);

/**
 * Check if a string is a valid LoreType
 */
export function isValidLoreType(value: string): value is LoreType {
  return LORE_TYPES.includes(value as LoreType);
}
