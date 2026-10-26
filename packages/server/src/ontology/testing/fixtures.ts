import { gameEventSchema } from '@dungeon/shared';
import type {
  GameEvent,
  GameEventOf,
  EventPayload,
  EpisodeSeed,
} from '@dungeon/shared';
import { seedFixture } from '../../engine/testing/fixtures.js';
import { MemoryStore } from '../MemoryStore.js';
import { project } from '../projector.js';
import type { OntologyReader } from '../OntologyStore.js';
import { edgeKey } from '../mutations.js';

export function record<T extends GameEvent['type']>(
  type: T,
  payload: EventPayload<T>,
  overrides: Partial<Omit<GameEventOf<T>, 'type' | 'payload'>> = {},
): GameEvent {
  return gameEventSchema.parse({
    v: 1,
    sessionId: 'session',
    beat: 1,
    seq: 0,
    actor: 'char:player',
    private: false,
    witnesses: ['char:player', 'char:peer'],
    createdBy: 'engine',
    traceId: 'trace',
    ...overrides,
    type,
    payload,
  });
}
export function ontologySeed(): EpisodeSeed {
  const seed = seedFixture();
  seed.locations.forEach((location) => {
    location.partOf = 'loc:building';
  });
  seed.locations.push({
    id: 'loc:building',
    name: 'Building',
    summary: '',
    tags: [],
    kind: 'building',
    lit: true,
    tileBounds: { x: 0, y: 0, w: 8, h: 4 },
  });
  seed.locations.push({
    id: 'loc:spot',
    name: 'Spot',
    summary: '',
    tags: [],
    kind: 'spot',
    lit: true,
    tileBounds: { x: 0, y: 1, w: 1, h: 1 },
    partOf: 'loc:room',
  });
  seed.facts.push(
    {
      id: 'fact:rumour',
      statement: 'Only the seller has seen the silver moon.',
      truth: false,
      kind: 'rumour',
      tags: [],
      about: ['char:seller'],
      knownBy: [
        { character: 'char:seller', confidence: 0.5 },
        { character: 'char:player', confidence: 0.6 },
      ],
    },
    {
      id: 'fact:secret',
      statement: 'The peer hid a ruby beneath the east stair.',
      truth: true,
      kind: 'secret',
      tags: [],
      about: ['loc:room'],
      knownBy: [{ character: 'char:peer', confidence: 1 }],
    },
    {
      id: 'fact:unknown',
      statement: 'An untouched letter names the seventh duke.',
      truth: true,
      kind: 'lore',
      tags: [],
      about: ['item:quest'],
      knownBy: [],
    },
  );
  seed.quests.push(
    {
      id: 'quest:episode',
      name: 'Quest',
      summary: '',
      tags: [],
      kind: 'episode',
      objective: 'Find the token',
      status: 'active',
    },
    {
      id: 'quest:personal',
      name: 'Personal',
      summary: '',
      tags: [],
      kind: 'personal',
      objective: 'Learn a rumour',
      status: 'active',
      pursuedBy: 'char:peer',
    },
  );
  seed.factions.push({
    id: 'faction:guild',
    name: 'Guild',
    summary: '',
    tags: [],
    ideals: 'Trade',
    standing: 'Good',
    members: [
      { character: 'char:seller', rank: 'merchant' },
      { character: 'char:peer' },
    ],
  });
  seed.attitudes.push({
    from: 'char:peer',
    to: 'char:player',
    value: 10,
    reason: 'Friendly',
  });
  seed.secrets.push({ character: 'char:peer', fact: 'fact:secret' });
  return seed;
}
export function seedRecord(seed = ontologySeed()): GameEvent {
  return record(
    'SeedLoaded',
    { seed, rngSeed: 'fixture' },
    { beat: 0, actor: null, createdBy: 'seed', witnesses: [] },
  );
}
export async function seededStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.apply(project(seedRecord()));
  return store;
}
export async function graphSnapshot(store: OntologyReader) {
  return {
    nodes: (await store.nodes()).sort((a, b) => a.id.localeCompare(b.id)),
    edges: (await store.edges()).sort((a, b) =>
      edgeKey(a).localeCompare(edgeKey(b)),
    ),
  };
}
