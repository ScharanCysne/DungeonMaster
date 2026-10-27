import { configSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { executeToolCall } from './execute.js';
import {
  attitude,
  fixture,
  rejects,
  story,
  voice,
} from './testing/fixtures.js';
import { failure } from './types.js';

it('counts every attempted ordinary call, including unknown, invalid and rejected calls; refuses the ninth', async () => {
  const { ctx } = await fixture();
  await rejects(ctx, 'missing', {}, 'UNKNOWN_TOOL');
  await rejects(ctx, 'move', {}, 'INVALID_INPUT');
  await rejects(
    ctx,
    'move',
    { actor: 'char:missing', to: 'loc:room' },
    'NO_SUCH_ENTITY',
  );
  for (let i = 0; i < 5; i++)
    expect((await executeToolCall('set_attitude', attitude, ctx)).ok).toBe(
      true,
    );
  expect(ctx.counters.toolCalls).toBe(8);
  await rejects(ctx, 'set_attitude', attitude, 'TOOL_CAP_REACHED');
  expect(ctx.counters.toolCalls).toBe(9);
});

it('allows four voice calls and narrate after the ordinary cap, without counting either', async () => {
  const { ctx, npcVoice } = await fixture();
  for (let i = 0; i < 8; i++)
    await executeToolCall('set_attitude', attitude, ctx);
  for (let i = 0; i < 4; i++)
    expect((await executeToolCall('voice_npc', voice, ctx)).ok).toBe(true);
  await rejects(ctx, 'voice_npc', voice, 'VOICE_NPC_CAP_REACHED');
  expect(npcVoice.voice).toHaveBeenCalledTimes(4);
  await rejects(ctx, 'narrate', {}, 'INVALID_INPUT');
  expect(
    (
      await executeToolCall(
        'narrate',
        { text: 'You look up.', lines: [{ lineId: 'line-1' }] },
        ctx,
      )
    ).ok,
  ).toBe(true);
  expect(ctx.counters).toEqual({
    toolCalls: 8,
    generatorCalls: 0,
    voiceNpcCalls: 5,
  });
});

it('refuses the fourth generator attempt, counting invalid and failed generation too', async () => {
  const { ctx, generators } = await fixture();
  await rejects(ctx, 'generate_story', {}, 'INVALID_INPUT');
  generators.generate_story.mockResolvedValueOnce(
    failure('GENERATION_FAILED', 'Try another brief.'),
  );
  await rejects(ctx, 'generate_story', story, 'GENERATION_FAILED');
  expect((await executeToolCall('generate_story', story, ctx)).ok).toBe(true);
  await rejects(
    ctx,
    'generate_item',
    { brief: 'Charm', placement: 'loc:room' },
    'GENERATOR_CAP_REACHED',
  );
  expect(generators.generate_story).toHaveBeenCalledTimes(2);
  expect(generators.generate_item).not.toHaveBeenCalled();
  expect(ctx.counters).toEqual({
    toolCalls: 4,
    generatorCalls: 4,
    voiceNpcCalls: 0,
  });
});

it('counts malformed voice attempts and voice failures against their own limit', async () => {
  const { ctx, npcVoice } = await fixture();
  await rejects(ctx, 'voice_npc', {}, 'INVALID_INPUT');
  npcVoice.voice.mockResolvedValueOnce(failure('VOICE_FAILED', 'Try later.'));
  await rejects(ctx, 'voice_npc', voice, 'VOICE_FAILED');
  await executeToolCall('voice_npc', voice, ctx);
  await executeToolCall('voice_npc', voice, ctx);
  await rejects(ctx, 'voice_npc', voice, 'VOICE_NPC_CAP_REACHED');
  expect(ctx.counters.toolCalls).toBe(0);
  expect(npcVoice.voice).toHaveBeenCalledTimes(3);
});

it('enforces configured limits before validation or injected work', async () => {
  const { ctx, generators, npcVoice } = await fixture({
    config: configSchema.parse({
      limits: { toolCalls: 1, generatorCalls: 0, voiceNpcPerBeat: 0 },
    }),
  });
  await rejects(ctx, 'generate_story', {}, 'GENERATOR_CAP_REACHED');
  await rejects(ctx, 'move', {}, 'TOOL_CAP_REACHED');
  await rejects(ctx, 'voice_npc', {}, 'VOICE_NPC_CAP_REACHED');
  expect(generators.generate_story).not.toHaveBeenCalled();
  expect(npcVoice.voice).not.toHaveBeenCalled();
});

it('stops state-changing calls after narration but allows narration correction', async () => {
  const { ctx } = await fixture();
  await executeToolCall('narrate', { text: 'You pause.', lines: [] }, ctx);
  await rejects(ctx, 'set_attitude', attitude, 'BEAT_FINISHED');
  expect(
    (await executeToolCall('narrate', { text: 'You listen.', lines: [] }, ctx))
      .ok,
  ).toBe(true);
  expect(ctx.narration?.text).toBe('You listen.');
});
