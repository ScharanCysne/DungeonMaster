import { generateItemOutputSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { executeToolCall } from '../tools/execute.js';
import { rejects } from '../tools/testing/fixtures.js';
import {
  feature,
  featureInput,
  fixture,
  item,
  itemInput,
  npc,
  npcInput,
  story,
  storyInput,
  structured,
} from './testing.js';

it.each([
  {
    tool: 'generate_item',
    input: itemInput,
    output: item,
    role: 'generator' as const,
  },
  {
    tool: 'generate_npc',
    input: npcInput,
    output: npc,
    role: 'generator' as const,
  },
  {
    tool: 'generate_feature',
    input: featureInput,
    output: feature,
    role: 'generator' as const,
  },
  {
    tool: 'generate_story',
    input: storyInput,
    output: story,
    role: 'story' as const,
  },
])(
  'puts the complete compact catalogue last on both $tool attempts',
  async ({ tool, input, output, role }) => {
    const { ctx, provider, sprites } = await fixture(
      [structured({}), structured(output)],
      { role },
    );
    expect((await executeToolCall(tool, input, ctx)).ok).toBe(true);
    expect(provider.requests).toHaveLength(2);
    for (const request of provider.requests) {
      const message = request.messages[0]?.content;
      if (typeof message !== 'string') throw new Error('Expected context');
      expect(message.split('\n\n').at(-1)).toBe(
        `Sprite catalogue tags: ${Object.keys(sprites.tags).join(',')}`,
      );
    }
    provider.assertDrained();
  },
);

it.each([{ tags: [] }, { tags: ['dented tin', 'red thread'] }])(
  'rejects items without a catalogue tag: $tags',
  async ({ tags }) => {
    const raw = { ...item, item: { ...item.item, tags } };
    const { ctx, provider } = await fixture([structured(raw), structured(raw)]);
    await rejects(
      ctx,
      'generate_item',
      itemInput,
      'GENERATION_FAILED',
      'catalogue tag',
    );
    expect(provider.requests).toHaveLength(2);
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
      'catalogue tag',
    );
  },
);

it('retries missing category tags once and persists the corrected tool sprite', async () => {
  const raw = {
    ...item,
    item: { ...item.item, kind: 'tool', tags: ['dented tin', 'red thread'] },
  };
  const corrected = {
    ...raw,
    item: { ...raw.item, tags: [' ＴＯＯＬＳ ', ...raw.item.tags] },
  };
  const { ctx, provider } = await fixture([
    structured(raw),
    structured(corrected),
  ]);
  const result = await executeToolCall('generate_item', itemInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  expect(generateItemOutputSchema.parse(result.value).item.sprite).toBe(
    'kenney-1-bit:237',
  );
  expect(provider.requests).toHaveLength(2);
  expect(
    ctx.events.filter((event) => event.type === 'EntityCreated'),
  ).toHaveLength(1);
  provider.assertDrained();
});

it('rejects an NPC and all inventory atomically if a starting item lacks a catalogue tag', async () => {
  const raw = {
    ...npc,
    startingItems: [{ ...item, item: { ...item.item, tags: ['red thread'] } }],
  };
  const { ctx, provider } = await fixture([structured(raw), structured(raw)]);
  await rejects(
    ctx,
    'generate_npc',
    npcInput,
    'GENERATION_FAILED',
    'catalogue tag',
  );
  expect(provider.requests).toHaveLength(2);
});

it('rejects a feature lacking a catalogue tag', async () => {
  const raw = { ...feature, tags: ['dusty recess'] };
  const { ctx } = await fixture([structured(raw), structured(raw)]);
  await rejects(
    ctx,
    'generate_feature',
    featureInput,
    'GENERATION_FAILED',
    'catalogue tag',
  );
});
