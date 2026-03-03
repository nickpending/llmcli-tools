/**
 * lib/source-map.ts - Shared event-to-source mapping
 *
 * Maps capture event types to their source names in the search table.
 * Single source of truth — used by realtime.ts and contradiction.ts.
 */

import type { CaptureEvent } from "./capture.js";

/**
 * Map event type to source name used in search table
 */
export function getSourceForEvent(event: CaptureEvent): string {
  switch (event.type) {
    case "knowledge":
      return "captures";
    case "teaching":
      return "teachings";
    case "observation":
      return "observations";
    case "insight":
      return "insights";
    case "task":
      return "flux";
    case "note":
      return "captures";
    default:
      return "captures";
  }
}
