import { expect, it } from 'vitest';
import {
  fixture,
  npc,
  npcInput,
  item,
  itemInput,
  structured,
} from '../agents/generators/testing.js';
import { executeToolCall } from '../agents/tools/execute.js';
import { spriteFallbackStats } from './genSampleStats.js';

it('reports fallback counts/rate per accepted physical entity, including inventory but excluding facts and retries', async () => {
  const raw = {
    ...npc,
    startingItems: [
      item,
      {
        ...item,
        item: { ...item.item, name: 'Cooper Wedge', tags: ['tools', 'wedge'] },
      },
    ],
  };
  const { ctx, sprites } = await fixture([structured({}), structured(raw)]);
  expect((await executeToolCall('generate_npc', npcInput, ctx)).ok).toBe(true);
  expect(spriteFallbackStats(ctx.events, sprites)).toEqual({
    generatedEntities: 3,
    spriteFallbacks: 1,
    spriteFallbackRate: 1 / 3,
  });
});

it('counts a catalogue match as a match even when its frame equals a fallback frame', async () => {
  const raw = {
    ...item,
    item: { ...item.item, kind: 'tool', tags: ['tools'] },
  };
  const { ctx, sprites } = await fixture([structured(raw)]);
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  expect(spriteFallbackStats(ctx.events, sprites)).toEqual({
    generatedEntities: 1,
    spriteFallbacks: 0,
    spriteFallbackRate: 0,
  });
});

it('reports zero safely when generation fails without creating entities', async () => {
  const { ctx, sprites } = await fixture([structured({}), structured({})]);
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    false,
  );
  expect(spriteFallbackStats(ctx.events, sprites)).toEqual({
    generatedEntities: 0,
    spriteFallbacks: 0,
    spriteFallbackRate: 0,
  });
});
