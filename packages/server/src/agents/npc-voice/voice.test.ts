import { expect, it } from 'vitest';
import { LlmUnavailableError } from '../llm/errors.js';
import { ScriptedProvider } from '../llm/ScriptedProvider.js';
import type { ScriptedReply } from '../llm/ScriptedProvider.js';
import { BeatContext } from '../tools/BeatContext.js';
import { executeToolCall } from '../tools/execute.js';
import { fixture } from '../tools/testing/fixtures.js';
import { createNpcVoice } from './index.js';

async function setup(replies: ScriptedReply[]) {
  const { ctx: base } = await fixture();
  const provider = new ScriptedProvider({ npc_voice: replies });
  const ctx = new BeatContext({
    engine: base.engine,
    store: base.store,
    generators: base.generators,
    npcVoice: createNpcVoice({ provider }),
  });
  return { ctx, provider };
}
const input = { npc: 'char:seller' as const, direction: 'Deflect politely.' };
const line: ScriptedReply = {
  type: 'structured',
  output: { text: 'Perhaps you should ask someone else.' },
};

it('registers unique per-beat lineIds across multiple voice instances', async () => {
  const { ctx, provider } = await setup([line, line, line]);
  ctx.voicedLines.set('voice-1-1', { speaker: input.npc, text: 'Earlier.' });
  const one = await executeToolCall('voice_npc', input, ctx);
  const two = await executeToolCall('voice_npc', input, ctx);
  const three = await createNpcVoice({ provider }).voice(input, ctx);
  expect(one).toMatchObject({ ok: true, value: { lineId: 'voice-1-2' } });
  expect(two).toMatchObject({ ok: true, value: { lineId: 'voice-1-3' } });
  expect(three).toMatchObject({ ok: true, value: { lineId: 'voice-1-4' } });
  expect(ctx.voicedLines.size).toBe(3);
  expect(provider.requests[0]).toMatchObject({
    role: 'npc_voice',
    timeoutMs: 20_000,
    promptVersion: 'npc-voice:v1',
  });
  expect(provider.requests[0]?.tools).toBeUndefined();
});

const failures: ScriptedReply[] = [
  { type: 'structured', output: { text: 'word '.repeat(61) } },
  { type: 'structured', output: { text: 'two\nlines' } },
  { type: 'structured', output: { text: '' } },
  { type: 'structured', output: { text: 'Hello.', lineId: 'forged' } },
  { type: 'refusal' },
  { type: 'error', error: new Error('failed voice') },
];
it.each(failures)(
  'returns a tool error without registering dialogue: $type',
  async (reply) => {
    const { ctx } = await setup([reply]);
    expect(await executeToolCall('voice_npc', input, ctx)).toMatchObject({
      ok: false,
      error: { code: 'NPC_VOICE_FAILED' },
    });
    expect(ctx.voicedLines.size).toBe(0);
    expect(ctx.events).toEqual([]);
  },
);

it('accepts the sixty-word boundary', async () => {
  const { ctx } = await setup([
    { type: 'structured', output: { text: 'word '.repeat(60) } },
  ]);
  expect(await executeToolCall('voice_npc', input, ctx)).toMatchObject({
    ok: true,
  });
});

it('propagates unavailability through the tool executor', async () => {
  const error = new LlmUnavailableError('npc_voice', 'model', 'offline');
  const { ctx } = await setup([{ type: 'error', error }]);
  await expect(executeToolCall('voice_npc', input, ctx)).rejects.toBe(error);
});

it('sees knowledge learned in this beat through the soft stream', async () => {
  const { ctx, provider } = await setup([line]);
  ctx.appendEvents([
    {
      type: 'FactLearned',
      actor: null,
      private: true,
      witnesses: ['char:seller'],
      payload: {
        characterId: 'char:seller',
        factId: 'fact:unknown',
        source: 'told',
        confidence: 1,
        since: 1,
      },
    },
  ]);
  await executeToolCall('voice_npc', input, ctx);
  expect(JSON.stringify(provider.requests[0]?.messages)).toContain(
    'An untouched letter names the seventh duke.',
  );
  expect(
    await ctx.store.edges({
      types: ['KNOWS'],
      from: 'char:seller',
      to: 'fact:unknown',
    }),
  ).toEqual([]);
});
