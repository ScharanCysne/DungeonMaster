import {
  generatedItemSchema,
  generatedNpcSchema,
  generatedFeatureSchema,
  generatedStorySchema,
} from '@dungeon/shared';
import type { Config, EpisodeSeed } from '@dungeon/shared';
import { loadEpisode } from '../../content/index.js';
import { Engine } from '../../engine/index.js';
import { gridFixture } from '../../engine/testing/fixtures.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { project } from '../../ontology/projector.js';
import { ontologySeed, seedRecord } from '../../ontology/testing/fixtures.js';
import { ScriptedProvider } from '../llm/ScriptedProvider.js';
import type { ScriptedReply } from '../llm/ScriptedProvider.js';
import { BeatContext } from '../tools/BeatContext.js';
import { fakeNpcVoice } from '../tools/testing/fakes.js';
import { createGenerators } from './index.js';

export const item = generatedItemSchema.parse({
  item: {
    name: 'Copper Thimble',
    summary: 'A dented copper thimble.',
    tags: ['coins', 'copper', 'sewing'],
    kind: 'trinket',
    rarity: 'common',
    magical: false,
    properties: [],
    weight: 0.1,
    value: 2,
    hidden: false,
  },
  backstory: [
    {
      statement: 'A tailor lost this thimble during supper.',
      truth: true,
      kind: 'backstory',
      about: [],
    },
  ],
});
export const npc = generatedNpcSchema.parse({
  npc: {
    name: 'Merrin Reed',
    summary: 'A tired cooper.',
    tags: ['cooper', 'apron'],
    role: 'npc',
    abilities: { str: 12, dex: 10, con: 12, int: 10, wis: 11, cha: 9 },
    proficiencies: ['perception'],
    hp: 12,
    maxHp: 12,
    ac: 11,
    conscious: true,
    hidden: false,
    gold: 6,
    personality: 'Soft spoken.',
    background: 'Repairs barrels.',
    appearance: 'Wears a floury apron.',
  },
  secret: {
    statement: 'Merrin once hid a debt from the guild.',
    truth: true,
    kind: 'secret',
    about: [],
  },
  attitudes: [
    { to: 'char:player', value: 45, reason: 'Welcoming to travellers.' },
  ],
  startingItems: [item],
});
export const feature = generatedFeatureSchema.parse({
  name: 'Ash Recess',
  summary: 'A recess behind the hearth.',
  tags: ['brick', 'ash', 'recess'],
  hidden: true,
  findDc: 10,
  locked: true,
  lockDc: 15,
  opened: false,
  tile: { x: 2, y: 2 },
});
export const story = generatedStorySchema.parse({
  facts: [
    {
      statement: 'An old cooper once held a feast here.',
      truth: true,
      kind: 'lore',
      about: ['loc:room'],
    },
  ],
});

export const itemInput = {
  brief: 'A small keepsake',
  placement: 'container:box',
} as const;
export const npcInput = { brief: 'A cooper', locationId: 'loc:room' } as const;
export const featureInput = {
  brief: 'A recess',
  locationId: 'loc:room',
  hidden: true,
  locked: true,
} as const;
export const storyInput = {
  brief: 'A feast',
  about: ['loc:room'],
  kind: 'lore',
} as const;
export const structured = (output: unknown): ScriptedReply => ({
  type: 'structured',
  output,
});

export async function fixture(
  replies: ScriptedReply[],
  options: {
    role?: 'generator' | 'story';
    config?: Config;
    real?: boolean;
    edit?: (seed: EpisodeSeed) => void;
  } = {},
) {
  const content = await loadEpisode();
  const seed = options.real ? content.seed : ontologySeed();
  options.edit?.(seed);
  const grid = options.real ? content.grid : gridFixture();
  const engine = new Engine(seed, grid, 'fixture');
  engine.beginBeat(1);
  const store = new MemoryStore();
  await store.apply(project(seedRecord(seed)));
  const provider = new ScriptedProvider({
    [options.role ?? 'generator']: replies,
  });
  const generators = createGenerators({ provider, sprites: content.sprites });
  const ctx = new BeatContext({
    engine,
    store,
    generators,
    npcVoice: fakeNpcVoice(),
    ...(options.config ? { config: options.config } : {}),
  });
  return { ctx, engine, store, provider, seed, grid, sprites: content.sprites };
}
