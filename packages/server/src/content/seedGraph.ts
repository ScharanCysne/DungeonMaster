import type { EpisodeSeed, GameEventOf } from '@dungeon/shared';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { project } from '../ontology/projector.js';

export function seedLoaded(seed: EpisodeSeed): GameEventOf<'SeedLoaded'> {
  return {
    v: 1,
    type: 'SeedLoaded',
    sessionId: seed.episodeId,
    beat: 0,
    seq: 0,
    actor: null,
    private: false,
    witnesses: [],
    createdBy: 'seed',
    traceId: `seed:${seed.episodeId}`,
    payload: { seed, rngSeed: seed.episodeId },
  };
}

export async function seedGraph(seed: EpisodeSeed, store: OntologyStore) {
  const mutations = project(seedLoaded(seed));
  // Catch missing endpoints before clearing the persistent graph.
  await new MemoryStore().apply(mutations);
  await store.clear();
  await store.apply(mutations);
  return store.read(async (reader) => ({
    nodes: (await reader.nodes()).length,
    edges: (await reader.edges()).length,
  }));
}
