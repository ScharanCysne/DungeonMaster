import { configSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import type { ScriptedReply } from '../llm/ScriptedProvider.js';
import { prepareRequest } from '../llm/request.js';
import { NARRATE_NOW } from './DmBeat.js';
import {
  attitude,
  call,
  finish,
  fixture,
  narration,
  response,
  turn,
} from './testing.js';

const tooLong = { ...narration, text: Array(213).fill('word').join(' ') };
const invalid = turn(call('narrate', tooLong));
const modes = ['ordinary', 'cap', 'critic', 'critic-cap'] as const;

async function scenario(
  mode: (typeof modes)[number],
  replies: ScriptedReply[],
) {
  const critic = mode.startsWith('critic');
  const capped = mode.endsWith('cap');
  const setup = await fixture(
    [
      ...(critic ? [finish] : []),
      ...(capped ? [turn(call('set_attitude', attitude))] : []),
      ...replies,
    ],
    configSchema.parse({
      limits: { toolCalls: 1, retryToolCallsForUnbackedOutcome: 1 },
    }),
  );
  if (critic) await setup.dm.run();
  const result = critic
    ? await setup.dm.retryNarration([
        {
          type: capped ? 'unbacked_outcome' : 'perspective_leak',
          quote: 'You pause.',
          explanation: 'Correct the proposed ending.',
        },
      ])
    : await setup.dm.run();
  setup.provider.assertDrained();
  expect(setup.ctx.counters.toolCalls).toBe(capped ? 1 : 0);
  return { ...setup, result };
}

it.each(modes)(
  '%s: too-long narrate then valid narrate succeeds',
  async (mode) => {
    const { result, provider } = await scenario(mode, [invalid, finish]);
    expect(result).toMatchObject({ status: 'narrated', narration });
    expect(result.toolCalls.slice(-2)).toMatchObject([
      { name: 'narrate', ok: false, error: { code: 'INVALID_INPUT' } },
      { name: 'narrate', ok: true },
    ]);
    expect(provider.requests.at(-1)?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', is_error: true }],
    });
  },
);

it.each(modes)(
  '%s: three invalid narrates exhaust the shared allowance',
  async (mode) => {
    const { result, ctx } = await scenario(mode, [invalid, invalid, invalid]);
    expect(result).toMatchObject({
      status: 'noNarration',
      narration: undefined,
    });
    expect(result.toolCalls.slice(-3)).toMatchObject([
      { name: 'narrate', ok: false, error: { code: 'INVALID_INPUT' } },
      { name: 'narrate', ok: false, error: { code: 'INVALID_INPUT' } },
      { name: 'narrate', ok: false, error: { code: 'INVALID_INPUT' } },
    ]);
    expect(ctx.narration).toBeUndefined();
  },
);

it.each([
  ['validation', tooLong, 'INVALID_INPUT'],
  [
    'handler',
    { ...narration, lines: [{ lineId: 'unvoiced-line' }] },
    'NPC_LINE_NOT_VOICED',
  ],
] as const)(
  'reminds with the actual %s error after a non-narrate turn, preserving history and tools',
  async (_kind, input, code) => {
    const ignored = [
      {
        type: 'thinking' as const,
        thinking: 'Consider the error.',
        signature: 's',
      },
      { type: 'text' as const, text: 'I will correct that.' },
    ];
    const { dm, provider, ctx } = await fixture([
      turn(call('narrate', input)),
      { type: 'response', response: response({ content: ignored }) },
      finish,
    ]);
    const result = await dm.run();
    expect(result.status).toBe('narrated');
    const failed = result.toolCalls[0];
    if (!failed || failed.ok) throw new Error('Expected failed narration');
    expect(failed.error.code).toBe(code);
    const toolResult = provider.requests[1]?.messages.at(-1);
    expect(toolResult).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'narrate',
          is_error: true,
          content: JSON.stringify({ ok: false, error: failed.error }),
        },
      ],
    });
    expect(provider.requests[2]?.messages.slice(-2)).toEqual([
      { role: 'assistant', content: ignored },
      { role: 'user', content: `${NARRATE_NOW}\n${failed.error.message}` },
    ]);
    for (const [index, request] of provider.requests.entries()) {
      expect(request.tools).toBe(provider.requests[0]?.tools);
      expect(request.system).toBe(provider.requests[0]?.system);
      expect(prepareRequest(request).tool_choice).toEqual({ type: 'auto' });
      expect(request.cacheTail).toBe('5m');
      const previous = provider.requests[index - 1];
      if (previous)
        expect(request.messages.slice(0, previous.messages.length)).toEqual(
          previous.messages,
        );
    }
    expect(ctx.counters.toolCalls).toBe(0);
    provider.assertDrained();
  },
);

it('uses the latest handler error in reminders and allows the third attempt to succeed', async () => {
  const { dm, provider, ctx } = await fixture([
    invalid,
    turn(call('narrate', { ...narration, lines: [{ lineId: 'missing' }] })),
    turn(call('set_attitude', attitude)),
    finish,
  ]);
  const result = await dm.run();
  expect(result).toMatchObject({ status: 'narrated', iterations: 4 });
  expect(provider.requests[3]?.messages.at(-1)).toEqual({
    role: 'user',
    content: `${NARRATE_NOW}\nmissing: expected a voice_npc line from this beat.`,
  });
  expect(result.toolCalls[2]).toMatchObject({
    ok: false,
    error: { code: 'NARRATION_REQUIRED' },
  });
  expect(ctx.events).toEqual([]);
  provider.assertDrained();
});

it('bounds multiple narrate calls in one turn and rejects a fourth without recording it', async () => {
  const { dm, ctx, provider } = await fixture([
    turn(
      ...[1, 2, 3].map((index) => call('narrate', tooLong, `bad-${index}`)),
      call('narrate', narration, 'fourth'),
    ),
  ]);
  const result = await dm.run();
  expect(result).toMatchObject({ status: 'noNarration', iterations: 1 });
  expect(result.toolCalls.at(-1)).toMatchObject({
    ok: false,
    error: { code: 'NARRATION_ATTEMPTS_EXHAUSTED' },
  });
  expect(ctx.narration).toBeUndefined();
  expect(ctx.counters.toolCalls).toBe(0);
  provider.assertDrained();
});

it('allows at most six executed narrates across the initial loop and critic retry', async () => {
  const { dm, provider } = await fixture([
    invalid,
    invalid,
    finish,
    invalid,
    invalid,
    finish,
  ]);
  const original = await dm.run();
  expect(original).toMatchObject({ status: 'narrated', iterations: 3 });
  const result = await dm.retryNarration([
    {
      type: 'perspective_leak',
      quote: 'You pause.',
      explanation: 'Correct the proposed ending.',
    },
  ]);
  expect(result).toMatchObject({ status: 'narrated', iterations: 6 });
  expect(result.toolCalls).toHaveLength(6);
  expect(original.toolCalls).toHaveLength(3);
  provider.assertDrained();
});

it('bounds ignored narration errors and reminders without executing other tools', async () => {
  const ignored = turn(call('set_attitude', attitude));
  const { dm, provider, ctx } = await fixture([
    invalid,
    ignored,
    ignored,
    ignored,
    ignored,
  ]);
  expect(await dm.run()).toMatchObject({
    status: 'noNarration',
    narration: undefined,
    iterations: 5,
  });
  expect(
    provider.requests.filter((request) => {
      const content = request.messages.at(-1)?.content;
      return typeof content === 'string' && content.startsWith(NARRATE_NOW);
    }),
  ).toHaveLength(2);
  expect(ctx.events).toEqual([]);
  expect(ctx.counters.toolCalls).toBe(0);
  provider.assertDrained();
});

it('incomplete narrate blocks execute nothing and do not spend a narration attempt', async () => {
  const { dm, provider } = await fixture([
    {
      type: 'response',
      response: response({
        stopReason: 'max_tokens',
        content: [call('narrate', narration)],
      }),
    },
    invalid,
    invalid,
    finish,
  ]);
  const result = await dm.run();
  expect(result).toMatchObject({ status: 'narrated', iterations: 4 });
  expect(result.toolCalls[0]).toMatchObject({
    ok: false,
    error: { code: 'FAILED_TURN' },
  });
  provider.assertDrained();
});
