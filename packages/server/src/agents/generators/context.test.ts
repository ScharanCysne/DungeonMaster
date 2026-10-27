import { expect, it } from 'vitest';
import { itemSchema } from '@dungeon/shared';
import { executeToolCall } from '../tools/execute.js';
import { rejects } from '../tools/testing/fixtures.js';
import { fixture, item, itemInput, structured } from './testing.js';
import { generationContext } from './context.js';
import { duplicateProblems } from './validation.js';

it('ignores empty tag unions for duplicate overlap checks', async () => {
  const { ctx } = await fixture([], {
    edit: (seed) => {
      for (const prior of seed.items) prior.tags = [];
    },
  });
  const context = await generationContext(ctx, ['loc:room']);
  expect(duplicateProblems('Distinct Item', [], 'item', context)).toEqual([]);
});

it('rejects normalized name duplicates across kinds and locations', async () => {
  const raw = { ...item, item: { ...item.item, name: '  PLÁYER!!! ' } };
  const { ctx } = await fixture([structured(raw), structured(raw)]);
  await rejects(
    ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    'duplicates char:player',
  );
});

it.each([
  ['boundary', ['coins', 'b', 'c', 'd', 'e'], 'loc:room', 'trinket', false],
  ['below boundary', ['coins', 'b', 'c', 'e'], 'loc:room', 'trinket', true],
  [
    'another item subtype',
    ['coins', 'b', 'c', 'd', 'e'],
    'loc:room',
    'tool',
    false,
  ],
  ['another location', ['coins', 'b', 'c', 'd'], 'loc:other', 'trinket', true],
] as const)(
  'uses Jaccard >= 0.8 only for the same kind and location: %s',
  async (_, tags, location, kind, ok) => {
    const raw = { ...item, item: { ...item.item, tags: [...tags] } };
    const { ctx } = await fixture(
      [structured(raw), ...(!ok ? [structured(raw)] : [])],
      {
        edit: (seed) => {
          const prior = seed.items.find((entry) => entry.id === 'item:floor');
          if (!prior) throw new Error('Missing item');
          prior.tags = [' COINS ', 'b', 'c', 'd', 'd'];
          prior.kind = kind;
          prior.holder = { kind: 'location', id: location };
        },
      },
    );
    if (!ok)
      await rejects(
        ctx,
        'generate_item',
        itemInput,
        'GENERATION_FAILED',
        'Jaccard 0.8',
      );
    else
      expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
        true,
      );
  },
);

it('includes graph tag frequency, pending entities, location contents and ABOUT facts in context', async () => {
  const second = {
    ...item,
    item: {
      ...item.item,
      name: 'Amber Button',
      tags: ['signet', 'amber', 'button'],
    },
  };
  const { ctx, store, provider } = await fixture([
    structured(item),
    structured(second),
  ]);
  await store.apply(
    [0, 1].map((index) => ({
      type: 'upsertNode' as const,
      node: itemSchema.parse({
        ...item.item,
        name: `Old ${index}`,
        id: `item:old-${index}` as const,
        tags: ['Copper', 'copper', 'winter'],
        questCritical: false,
        createdBy: 'generator:item' as const,
        createdAtBeat: 0,
      }),
    })),
  );
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  expect(
    (
      await executeToolCall(
        'generate_item',
        { ...itemInput, placement: 'char:seller' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  const message = JSON.stringify(provider.requests[1]?.messages);
  expect(message).toContain('recentlyUsedMotifs');
  const content = provider.requests[1]?.messages[0]?.content;
  if (typeof content !== 'string') throw new Error('Expected text context');
  expect(content).toContain('"tag":"copper","count":3');
  expect(content).toContain('"tag":"winter","count":2');
  expect(content.indexOf('"tag":"copper"')).toBeLessThan(
    content.indexOf('"tag":"winter"'),
  );
  expect(content).toContain('Copper Thimble');
  expect(content).toContain('Only the seller has seen the silver moon.');
  expect(content).toContain('The peer hid a ruby beneath the east stair.');
  expect(content).toContain('container:box');
});

it('rejects a name created earlier in the same beat', async () => {
  const { ctx } = await fixture([
    structured(item),
    structured(item),
    structured(item),
  ]);
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  await rejects(
    ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    'duplicates item:copper-thimble',
  );
});

it('rejects missing fact references before any registration', async () => {
  const raw = {
    ...item,
    backstory: [{ ...item.backstory[0], about: ['char:missing'] }],
  };
  const { ctx } = await fixture([structured(raw), structured(raw)]);
  await rejects(
    ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    'char:missing',
  );
});
