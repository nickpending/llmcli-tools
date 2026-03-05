import type { ConceptNode, Resource } from "./types";
import { readDomain, writeDomain } from "./state";

export function addConcept(
  domain: string,
  concept: {
    id: string;
    title: string;
    description?: string;
    prereqs: string[];
    difficulty: number;
  },
) {
  const state = readDomain(domain);

  if (state.curriculum.concepts.find((c) => c.id === concept.id)) {
    throw new Error(
      `Concept '${concept.id}' already exists in domain '${domain}'`,
    );
  }

  const node: ConceptNode = {
    id: concept.id,
    title: concept.title,
    description: concept.description ?? "",
    prerequisites: concept.prereqs,
    difficulty_estimate: concept.difficulty,
    source_refs: [],
    resources: [],
  };

  state.curriculum.concepts.push(node);
  writeDomain(state);
  return state;
}

export function setConceptResources(
  domain: string,
  conceptId: string,
  resources: Resource[],
) {
  const state = readDomain(domain);
  const concept = state.curriculum.concepts.find((c) => c.id === conceptId);
  if (!concept) {
    throw new Error(`Concept '${conceptId}' not found in domain '${domain}'`);
  }

  concept.resources = resources;
  writeDomain(state);
  return state;
}

function topologicalSort(concepts: ConceptNode[]): {
  acyclic: boolean;
  order?: string[];
  cycle?: string[];
} {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const c of concepts) {
    inDegree.set(c.id, 0);
    adj.set(c.id, []);
  }
  for (const c of concepts) {
    for (const prereq of c.prerequisites) {
      adj.get(prereq)?.push(c.id);
      inDegree.set(c.id, (inDegree.get(c.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (order.length < concepts.length) {
    const inOrder = new Set(order);
    const cycleNodes = concepts
      .map((c) => c.id)
      .filter((id) => !inOrder.has(id));
    return { acyclic: false, cycle: cycleNodes };
  }
  return { acyclic: true, order };
}

export function validateCurriculum(domain: string) {
  const state = readDomain(domain);
  const result = topologicalSort(state.curriculum.concepts);

  const concepts_without_resources = state.curriculum.concepts
    .filter((c) => c.resources.length === 0)
    .map((c) => c.id);

  return {
    ...result,
    concept_count: state.curriculum.concepts.length,
    concepts_without_resources,
  };
}

export async function verifyUrls(domain: string) {
  const state = readDomain(domain);

  const urlEntries: Array<{ concept_id: string; url: string }> = [];
  for (const concept of state.curriculum.concepts) {
    for (const resource of concept.resources) {
      urlEntries.push({ concept_id: concept.id, url: resource.url });
    }
  }

  const live: Array<{ concept_id: string; url: string }> = [];
  const dead: Array<{ concept_id: string; url: string; status?: number }> = [];

  // Batch concurrency: 10 at a time
  for (let i = 0; i < urlEntries.length; i += 10) {
    const batch = urlEntries.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const resp = await fetch(entry.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        return { entry, status: resp.status, ok: resp.ok };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { entry, status, ok } = result.value;
        if (ok) {
          live.push({ concept_id: entry.concept_id, url: entry.url });
        } else {
          dead.push({ concept_id: entry.concept_id, url: entry.url, status });
        }
      } else {
        // Network error or timeout
        const entry = batch[results.indexOf(result)];
        dead.push({ concept_id: entry.concept_id, url: entry.url });
      }
    }
  }

  return { checked: urlEntries.length, live, dead };
}
