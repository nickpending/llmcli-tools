import { getConfig } from "./config";
import { listDomains, readDomain, writeDomain } from "./state";
import type { MasteryLevel, Resource } from "./types";

export interface SessionStatus {
  domains: Array<{
    name: string;
    session_count: number;
    last_session: string | null;
    days_since_session: number | null;
    is_stale: boolean;
    concept_count: number;
    mastery_distribution: Record<MasteryLevel, number>;
  }>;
}

export function recordSession(
  domain: string,
  data: {
    concepts_covered: string[];
    calibration: "too-easy" | "right" | "too-hard";
    duration_minutes: number;
    persona: string;
    context: string;
    confusion_pairs_encountered?: string[];
    resources_suggested?: Resource[];
    resources_used?: string[];
    breakthrough_moments?: string[];
    struggle_descriptions?: string[];
  },
): void {
  const state = readDomain(domain);
  const now = new Date();
  const hour = now.getHours();
  const time_of_day = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  state.session_history.push({
    date: now.toISOString().slice(0, 10),
    time_of_day,
    duration_minutes: data.duration_minutes,
    concepts_covered: data.concepts_covered,
    persona: data.persona,
    context: data.context,
    calibration: data.calibration,
    confusion_pairs_encountered: data.confusion_pairs_encountered ?? [],
    resources_suggested: data.resources_suggested ?? [],
    resources_used: data.resources_used ?? [],
    breakthrough_moments: data.breakthrough_moments ?? [],
    struggle_descriptions: data.struggle_descriptions ?? [],
  });

  state.session_count++;
  state.last_session = now.toISOString();

  writeDomain(state);
}

export function getSessionStatus(domain?: string): SessionStatus {
  const config = getConfig();
  const names = domain ? [domain] : listDomains();

  const domains = names.map((name) => {
    const state = readDomain(name);

    let days_since_session: number | null = null;
    let is_stale = false;

    if (state.last_session) {
      const last = new Date(state.last_session);
      const now = new Date();
      days_since_session = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      is_stale = days_since_session > config.session.staleness_threshold_days;
    }

    const mastery_distribution: Record<MasteryLevel, number> = {
      none: 0,
      introduced: 0,
      practiced: 0,
      reinforced: 0,
      solid: 0,
    };

    for (const progress of Object.values(state.progress)) {
      mastery_distribution[progress.mastery]++;
    }

    return {
      name,
      session_count: state.session_count,
      last_session: state.last_session,
      days_since_session,
      is_stale,
      concept_count: state.curriculum.concepts.length,
      mastery_distribution,
    };
  });

  return { domains };
}
