import {
  fsrs as makeFSRSInstance,
  createEmptyCard,
  Rating,
  type Grade,
} from "ts-fsrs";
import type { StepUnit } from "ts-fsrs";
import { getConfig } from "./config";
import type {
  FSRSRating,
  MasteryLevel,
  DueConcept,
  ConceptNode,
  ConceptProgress,
} from "./types";
import { readDomain, writeDomain, listDomains } from "./state";

function makeFSRS() {
  const config = getConfig();
  return makeFSRSInstance({
    request_retention: config.fsrs.request_retention,
    maximum_interval: config.fsrs.maximum_interval,
    enable_fuzz: config.fsrs.enable_fuzz,
    learning_steps: config.fsrs.learning_steps as StepUnit[],
    relearning_steps: config.fsrs.relearning_steps as StepUnit[],
  });
}

const ratingMap: Record<FSRSRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function isDue(card: { due: Date | number | string }): boolean {
  return new Date(card.due) <= new Date();
}

function makeDefaultProgress(): ConceptProgress {
  return {
    mastery: "none",
    fsrs_card: createEmptyCard(),
    struggle_points: [],
    confusion_pairs: [],
    assignments: [],
  };
}

export function updateProgress(
  domain: string,
  conceptId: string,
  rating: FSRSRating,
  mastery?: MasteryLevel,
) {
  const state = readDomain(domain);

  if (!state.progress[conceptId]) {
    state.progress[conceptId] = makeDefaultProgress();
  }

  const card = state.progress[conceptId].fsrs_card;
  const f = makeFSRS();
  const result = f.next(card, new Date(), ratingMap[rating]);

  state.progress[conceptId].fsrs_card = result.card;
  if (mastery !== undefined) {
    state.progress[conceptId].mastery = mastery;
  }

  writeDomain(state);
  return { domain: state, next_due: result.card.due.toISOString() };
}

export function getDueConcepts(domain: string): DueConcept[] {
  const state = readDomain(domain);
  const result = new Map<string, DueConcept>();

  // Find concepts with progress entries that are due
  for (const [conceptId, progress] of Object.entries(state.progress)) {
    if (isDue(progress.fsrs_card)) {
      const concept = state.curriculum.concepts.find((c) => c.id === conceptId);
      result.set(conceptId, {
        concept_id: conceptId,
        title: concept?.title ?? conceptId,
        due: new Date(
          progress.fsrs_card.due as unknown as string,
        ).toISOString(),
        state: progress.fsrs_card.state as number,
        mastery: progress.mastery,
        confusion_pair: false,
      });
    }
  }

  // Co-schedule confusion pairs
  const dueIds = [...result.keys()];
  for (const dueId of dueIds) {
    const progress = state.progress[dueId];
    for (const pairId of progress.confusion_pairs) {
      if (result.has(pairId)) {
        // Already in result — mark as confusion pair
        const existing = result.get(pairId)!;
        existing.confusion_pair = true;
        // Also mark the original
        result.get(dueId)!.confusion_pair = true;
        continue;
      }

      // Add confusion pair even if not independently due
      const pairProgress = state.progress[pairId];
      const pairConcept = state.curriculum.concepts.find(
        (c) => c.id === pairId,
      );

      if (pairProgress) {
        result.set(pairId, {
          concept_id: pairId,
          title: pairConcept?.title ?? pairId,
          due: new Date(
            pairProgress.fsrs_card.due as unknown as string,
          ).toISOString(),
          state: pairProgress.fsrs_card.state as number,
          mastery: pairProgress.mastery,
          confusion_pair: true,
        });
      } else {
        // No progress entry — use defaults
        result.set(pairId, {
          concept_id: pairId,
          title: pairConcept?.title ?? pairId,
          due: new Date().toISOString(),
          state: 0,
          mastery: "none",
          confusion_pair: true,
        });
      }

      // Mark the triggering concept too
      result.get(dueId)!.confusion_pair = true;
    }
  }

  return [...result.values()];
}

const MASTERED_LEVELS = new Set<string>(["practiced", "reinforced", "solid"]);

export function getReadyConcepts(domain: string): ConceptNode[] {
  const state = readDomain(domain);

  const masteredIds = new Set(
    Object.entries(state.progress)
      .filter(([, p]) => MASTERED_LEVELS.has(p.mastery))
      .map(([id]) => id),
  );

  return state.curriculum.concepts.filter((concept) => {
    const progress = state.progress[concept.id];
    const isNew = !progress || progress.fsrs_card.state === 0;
    const prereqsMet = concept.prerequisites.every((prereq) =>
      masteredIds.has(prereq),
    );
    return isNew && prereqsMet;
  });
}

export function addConfusionPair(
  domain: string,
  conceptA: string,
  conceptB: string,
) {
  const state = readDomain(domain);

  // Initialize progress entries if missing
  if (!state.progress[conceptA]) {
    state.progress[conceptA] = makeDefaultProgress();
  }
  if (!state.progress[conceptB]) {
    state.progress[conceptB] = makeDefaultProgress();
  }

  // Bidirectional + idempotent
  if (!state.progress[conceptA].confusion_pairs.includes(conceptB)) {
    state.progress[conceptA].confusion_pairs.push(conceptB);
  }
  if (!state.progress[conceptB].confusion_pairs.includes(conceptA)) {
    state.progress[conceptB].confusion_pairs.push(conceptA);
  }

  writeDomain(state);
  return state;
}

export function getNudgeStatus() {
  const domains = listDomains();
  const config = getConfig();

  const stale_domains: string[] = [];
  const due_reviews: Record<string, number> = {};

  for (const name of domains) {
    const state = readDomain(name);

    // Check staleness
    if (state.last_session) {
      const last = new Date(state.last_session);
      const now = new Date();
      const daysSince = Math.floor(
        (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince > config.session.staleness_threshold_days) {
        stale_domains.push(name);
      }
    }

    // Count due reviews
    let dueCount = 0;
    for (const progress of Object.values(state.progress)) {
      if (isDue(progress.fsrs_card)) {
        dueCount++;
      }
    }
    if (dueCount > 0) {
      due_reviews[name] = dueCount;
    }
  }

  return { stale_domains, due_reviews };
}
