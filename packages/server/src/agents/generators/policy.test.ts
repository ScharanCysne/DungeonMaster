import { configSchema } from '@dungeon/shared';
import type { GeneratedItem, GeneratedNpc } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { executeToolCall } from '../tools/execute.js';
import { rejects } from '../tools/testing/fixtures.js';
import {
  fixture,
  item,
  itemInput,
  npc,
  npcInput,
  structured,
} from './testing.js';

const itemCases: [string, Partial<GeneratedItem['item']>, string][] = [
  ['very rare', { rarity: 'very_rare' }, 'maximum rare'],
  ['legendary', { rarity: 'legendary' }, 'maximum rare'],
  ['value above cap', { value: 501 }, 'maximum 500'],
  ['negative value', { value: -1 }, 'item.value'],
  ['negative weight', { weight: -1 }, 'item.weight'],
  ['invalid discovery DC', { findDc: 7 }, 'item.findDc'],
];
it.each(itemCases)(
  'rejects %s twice without mutations',
  async (_, patch, problem) => {
    const raw = { ...item, item: { ...item.item, ...patch } };
    const { ctx, provider } = await fixture([structured(raw), structured(raw)]);
    await rejects(
      ctx,
      'generate_item',
      itemInput,
      'GENERATION_FAILED',
      problem,
    );
    expect(provider.requests).toHaveLength(2);
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain(problem);
  },
);

it.each(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const)(
  'enforces both %s ability bounds',
  async (ability) => {
    for (const value of [5, 19]) {
      const raw = structuredClone(npc);
      raw.npc.abilities[ability] = value;
      const { ctx } = await fixture([structured(raw), structured(raw)]);
      await rejects(
        ctx,
        'generate_npc',
        npcInput,
        'GENERATION_FAILED',
        `abilities.${ability} ${value}`,
      );
    }
  },
);

const npcCases: [string, Partial<GeneratedNpc['npc']>, string][] = [
  ['low HP', { hp: 3 }, 'npc.hp 3'],
  ['high HP', { hp: 41 }, 'npc.hp 41'],
  ['low max HP', { maxHp: 3 }, 'npc.maxHp 3'],
  ['high max HP', { maxHp: 41 }, 'npc.maxHp 41'],
  ['low AC', { ac: 9 }, 'npc.ac 9'],
  ['high AC', { ac: 18 }, 'npc.ac 18'],
  ['inconsistent HP', { hp: 13, maxHp: 12 }, 'inconsistent'],
  ['inconsistent consciousness', { conscious: false }, 'inconsistent'],
  ['negative gold', { gold: -1 }, 'npc.gold'],
];
it.each(npcCases)('rejects %s', async (_, patch, problem) => {
  const raw = { ...npc, npc: { ...npc.npc, ...patch } };
  const { ctx } = await fixture([structured(raw), structured(raw)]);
  await rejects(ctx, 'generate_npc', npcInput, 'GENERATION_FAILED', problem);
});

it('accepts inclusive item bounds and stricter per-request constraints', async () => {
  const raw = { ...item, item: { ...item.item, rarity: 'rare', value: 500 } };
  const { ctx } = await fixture([structured(raw)]);
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  const limited = await fixture([structured(raw), structured(raw)]);
  await rejects(
    limited.ctx,
    'generate_item',
    { ...itemInput, constraints: { maxRarity: 'uncommon' } },
    'GENERATION_FAILED',
    'maximum uncommon',
  );
});

it('enforces the requested kind', async () => {
  const { ctx } = await fixture([structured(item), structured(item)]);
  await rejects(
    ctx,
    'generate_item',
    { ...itemInput, constraints: { kind: 'weapon' } },
    'GENERATION_FAILED',
    'expected weapon',
  );
});

it('reads item and NPC limits from config', async () => {
  const config = configSchema.parse({
    limits: { generatedItemMaxValueGp: 1, generatedItemMaxRarity: 'common' },
    generatorStats: { abilityMax: 11, hpMax: 11, acMax: 10 },
  });
  const items = await fixture([structured(item), structured(item)], { config });
  await rejects(
    items.ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    'maximum 1',
  );
  const npcs = await fixture([structured(npc), structured(npc)], { config });
  await rejects(
    npcs.ctx,
    'generate_npc',
    npcInput,
    'GENERATION_FAILED',
    'expected 6..11',
  );
});

it('checks every starting item before creating the NPC or any inventory', async () => {
  const raw = {
    ...npc,
    startingItems: [
      item,
      { ...item, item: { ...item.item, name: 'Other', value: 501 } },
    ],
  };
  const { ctx } = await fixture([structured(raw), structured(raw)]);
  await rejects(
    ctx,
    'generate_npc',
    npcInput,
    'GENERATION_FAILED',
    'maximum 500',
  );
});

it.each([-101, 101])(
  'rejects initial attitude %s outside ontology bounds',
  async (value) => {
    const raw = {
      ...npc,
      attitudes: [{ to: 'char:player', value, reason: 'Test' }],
    };
    const { ctx } = await fixture([structured(raw), structured(raw)]);
    await rejects(
      ctx,
      'generate_npc',
      npcInput,
      'GENERATION_FAILED',
      'properties.value',
    );
  },
);

it('counts generated NPCs from the graph, including pending creations, not seed NPCs', async () => {
  const second = {
    ...npc,
    npc: { ...npc.npc, name: 'Other Guest', tags: ['different'] },
    startingItems: [],
  };
  const { ctx, store } = await fixture([
    structured(npc),
    structured(second),
    structured(second),
  ]);
  await store.apply(
    Array.from({ length: 11 }, (_, index) => ({
      type: 'upsertNode' as const,
      node: {
        ...npc.npc,
        id: `char:prior-${index}` as const,
        name: `Prior ${index}`,
        tags: [],
        createdBy: 'generator:npc' as const,
        createdAtBeat: 0,
      },
    })),
  );
  expect((await executeToolCall('generate_npc', npcInput, ctx)).ok).toBe(true);
  await rejects(
    ctx,
    'generate_npc',
    npcInput,
    'GENERATION_FAILED',
    '12 generated NPCs',
  );
});

it('rejects duplicate starting inventory within one response', async () => {
  const raw = { ...npc, startingItems: [item, item] };
  const { ctx } = await fixture([structured(raw), structured(raw)]);
  await rejects(
    ctx,
    'generate_npc',
    npcInput,
    'GENERATION_FAILED',
    'duplicates',
  );
});

it('leaves the beat cap to the registry, counting one call per generation including its retry', async () => {
  const { ctx, provider } = await fixture([structured({}), structured(item)], {
    config: configSchema.parse({ limits: { generatorCalls: 1 } }),
  });
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  await rejects(ctx, 'generate_item', itemInput, 'GENERATOR_CAP_REACHED');
  expect(provider.requests).toHaveLength(2);
});
