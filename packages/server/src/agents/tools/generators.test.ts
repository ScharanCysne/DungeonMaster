import { toolSchemas } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { executeToolCall } from './execute.js';
import { fixture, rejects, story } from './testing/fixtures.js';
import { failure } from './types.js';

const requests = [
  [
    'generate_item',
    {
      brief: 'A charm',
      placement: 'loc:room',
      constraints: { kind: 'trinket', maxRarity: 'uncommon' },
    },
  ],
  [
    'generate_npc',
    {
      brief: 'A guest',
      locationId: 'loc:room',
      hints: { role: 'merchant', attitudeToParty: 10 },
    },
  ],
  [
    'generate_feature',
    { brief: 'A trapdoor', locationId: 'loc:room', hidden: true, locked: true },
  ],
  ['generate_story', story],
] as const;

it.each(requests)(
  'delegates %s to the injected generator and returns its registered output',
  async (name, input) => {
    const { ctx, generators } = await fixture();
    const result = await executeToolCall(name, input, ctx);
    expect(result.ok).toBe(true);
    expect(generators[name]).toHaveBeenCalledExactlyOnceWith(input, ctx);
    if (result.ok)
      expect(toolSchemas[name].output.safeParse(result.value).success).toBe(
        true,
      );
    expect(ctx.counters).toEqual({
      toolCalls: 1,
      generatorCalls: 1,
      voiceNpcCalls: 0,
    });
  },
);

it('returns generator failures unchanged and leaves pending state untouched', async () => {
  const { ctx, generators } = await fixture();
  generators.generate_story.mockResolvedValueOnce(
    failure('GENERATION_FAILED', 'No consistent story found.'),
  );
  await rejects(
    ctx,
    'generate_story',
    story,
    'GENERATION_FAILED',
    'No consistent story found.',
  );
});

it('makes generator-created facts available to subsequent soft tools', async () => {
  const { ctx } = await fixture();
  await executeToolCall('generate_story', story, ctx);
  expect(
    (
      await executeToolCall(
        'share_fact',
        { factId: 'fact:generated', to: ['char:player'], source: 'read' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  expect(ctx.events.map((event) => event.type)).toEqual([
    'FactCreated',
    'FactLearned',
  ]);
  expect(ctx.events.map((event) => event.createdBy)).toEqual([
    'generator:story',
    'engine',
  ]);
});
