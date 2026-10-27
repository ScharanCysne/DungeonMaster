import { expect, it } from 'vitest';
import { entry } from '../../engine/testing/fixtures.js';
import { BeatContext } from './BeatContext.js';
import { executeToolCall } from './execute.js';
import { fixture, rejects, voice } from './testing/fixtures.js';
import { success } from './types.js';

it('delegates voice direction and records the returned line under its actual speaker', async () => {
  const { ctx, npcVoice } = await fixture();
  expect(await executeToolCall('voice_npc', voice, ctx)).toMatchObject({
    ok: true,
    value: { lineId: 'line-1', text: 'I saw a painted moon.' },
  });
  expect(npcVoice.voice).toHaveBeenCalledExactlyOnceWith(voice, ctx);
  expect(ctx.voicedLines.get('line-1')).toEqual({
    speaker: 'char:seller',
    text: 'I saw a painted moon.',
  });
  expect(ctx.finished).toBe(false);
  expect(ctx.events).toEqual([]);
});

it.each([
  [{ ...voice, npc: 'char:missing' }, 'NO_SUCH_ENTITY'],
  [{ ...voice, npc: 'char:peer' }, 'NOT_AN_NPC'],
  [{ ...voice, npc: 'char:player' }, 'NOT_AN_NPC'],
  [{ ...voice, npc: 'char:other' }, 'NOT_IN_SAME_ROOM'],
  [{ ...voice, direction: 'word '.repeat(41) }, 'INVALID_INPUT'],
])(
  'rejects invalid voice requests before delegation %#',
  async (input, code) => {
    const { ctx, npcVoice } = await fixture();
    await rejects(ctx, 'voice_npc', input, code);
    expect(npcVoice.voice).not.toHaveBeenCalled();
  },
);

it('uses current engine consciousness and location for voice validation', async () => {
  const { ctx, npcVoice } = await fixture();
  await executeToolCall(
    'apply_damage',
    { target: 'char:seller', dice: '1d4+100', cause: 'fall' },
    ctx,
  );
  await rejects(ctx, 'voice_npc', voice, 'NPC_UNCONSCIOUS');
  expect(npcVoice.voice).not.toHaveBeenCalled();
  await executeToolCall(
    'heal',
    { target: 'char:seller', dice: '1d4', source: 'rest' },
    ctx,
  );
  expect((await executeToolCall('voice_npc', voice, ctx)).ok).toBe(true);
  await executeToolCall('move', { actor: 'char:seller', to: 'loc:other' }, ctx);
  await rejects(ctx, 'voice_npc', voice, 'NOT_IN_SAME_ROOM');
});

it('accepts a conscious NPC in a spot in the same room and the exact direction word boundary', async () => {
  const { ctx } = await fixture({
    edit(seed) {
      entry(seed.characters, 'char:seller').location = 'loc:spot';
    },
  });
  expect(
    (
      await executeToolCall(
        'voice_npc',
        { ...voice, direction: 'word '.repeat(40) },
        ctx,
      )
    ).ok,
  ).toBe(true);
});

it('rejects malformed voice output and duplicate line IDs without overwriting speech', async () => {
  const { ctx, npcVoice } = await fixture();
  npcVoice.voice.mockResolvedValueOnce(
    success({ lineId: '', text: '' }, [], []),
  );
  await rejects(ctx, 'voice_npc', voice, 'INVALID_VOICE_OUTPUT');
  await executeToolCall('voice_npc', voice, ctx);
  npcVoice.voice.mockResolvedValueOnce(
    success({ lineId: 'line-1', text: 'Changed.' }, [], []),
  );
  await rejects(
    ctx,
    'voice_npc',
    { ...voice, npc: 'char:watcher' },
    'DUPLICATE_LINE_ID',
  );
});

it.each([
  [[{ lineId: 'unvoiced' }], 'NPC_LINE_NOT_VOICED'],
  [[{ speaker: 'char:seller', text: 'Invented NPC speech.' }], 'NOT_A_PEER'],
  [[{ speaker: 'char:player', text: 'Invented player speech.' }], 'NOT_A_PEER'],
  [[{ speaker: 'char:peer', text: 'Never said.' }], 'PEER_LINE_NOT_SAID'],
  [[{ speaker: 'char:peer', text: 'I will look. ' }], 'PEER_LINE_NOT_SAID'],
  [[{ speaker: 'char:missing', text: 'Hello.' }], 'NO_SUCH_ENTITY'],
])(
  'rejects unsupported dialogue and permits correction %#',
  async (lines, code) => {
    const { ctx } = await fixture({
      peerSayLines: [{ speaker: 'char:peer', text: 'I will look.' }],
    });
    await rejects(ctx, 'narrate', { text: 'You listen.', lines }, code);
    expect(
      (
        await executeToolCall(
          'narrate',
          { text: 'You listen.', lines: [] },
          ctx,
        )
      ).ok,
    ).toBe(true);
  },
);

it('resolves an ordered mix of NPC references and exact peer speech, returning the shared reference form', async () => {
  const { ctx } = await fixture({
    peerSayLines: [{ speaker: 'char:peer', text: 'I will look.' }],
  });
  await executeToolCall('voice_npc', voice, ctx);
  await executeToolCall('voice_npc', { ...voice, npc: 'char:watcher' }, ctx);
  const input = {
    text: 'You listen.',
    mood: 'calm',
    lines: [
      { lineId: 'line-1' },
      { speaker: 'char:peer', text: 'I will look.' },
      { lineId: 'line-2' },
    ],
  };
  expect(await executeToolCall('narrate', input, ctx)).toMatchObject({
    ok: true,
    value: input,
    events: [],
  });
  expect(ctx.narration).toEqual({
    text: input.text,
    mood: 'calm',
    lines: [
      {
        lineId: 'line-1',
        speaker: 'char:seller',
        text: 'I saw a painted moon.',
      },
      { speaker: 'char:peer', text: 'I will look.' },
      {
        lineId: 'line-2',
        speaker: 'char:watcher',
        text: 'I saw a painted moon.',
      },
    ],
  });
  expect(ctx.finished).toBe(true);
});

it('does not accept a previous beat line or speech authorized for a different peer', async () => {
  const { ctx, engine, store, generators, npcVoice } = await fixture({
    peerSayLines: [{ speaker: 'char:watcher', text: 'I will look.' }],
  });
  await executeToolCall('voice_npc', voice, ctx);
  await rejects(
    ctx,
    'narrate',
    { text: '', lines: [{ speaker: 'char:peer', text: 'I will look.' }] },
    'PEER_LINE_NOT_SAID',
  );
  engine.beginBeat(2);
  const next = new BeatContext({ engine, store, generators, npcVoice });
  await rejects(
    next,
    'narrate',
    { text: '', lines: [{ lineId: 'line-1' }] },
    'NPC_LINE_NOT_VOICED',
  );
});

it('retains word-count refinements and atomically rejects a later bad line', async () => {
  const { ctx } = await fixture();
  await executeToolCall('voice_npc', voice, ctx);
  await rejects(
    ctx,
    'narrate',
    { text: 'word '.repeat(181), lines: [] },
    'INVALID_INPUT',
    '180 words',
  );
  await rejects(
    ctx,
    'narrate',
    {
      text: 'You listen.',
      lines: [{ lineId: 'line-1' }, { lineId: 'missing' }],
    },
    'NPC_LINE_NOT_VOICED',
  );
  expect(
    (
      await executeToolCall(
        'narrate',
        { text: 'word '.repeat(180), lines: [] },
        ctx,
      )
    ).ok,
  ).toBe(true);
});
