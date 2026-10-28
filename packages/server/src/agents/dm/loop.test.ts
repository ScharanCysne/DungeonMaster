import { configSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { LlmRefusalError, LlmUnavailableError } from '../llm/errors.js';
import { prepareRequest } from '../llm/request.js';
import type { LlmContentBlock } from '../llm/types.js';
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

it('returns all tool results in order in one user turn and preserves full assistant content', async () => {
  const content: LlmContentBlock[] = [
    {
      type: 'thinking',
      thinking: 'Keep this exact thought.',
      signature: 'signature',
    },
    { type: 'redacted_thinking', data: 'opaque' },
    {
      type: 'fallback',
      from: { model: 'claude-opus-5-5' },
      to: { model: 'claude-sonnet-5-5' },
    },
    { type: 'text', text: 'The attempt warrants a social consequence.' },
    call('set_attitude', attitude, 'a'),
    call('unknown', {}, 'b'),
  ];
  const { dm, provider, ctx } = await fixture([turn(...content), finish]);
  const before = structuredClone(content);
  const result = await dm.run();
  expect(result).toMatchObject({
    status: 'narrated',
    narration,
    iterations: 2,
    toolCalls: [
      { name: 'set_attitude', input: attitude, ok: true },
      { name: 'unknown', ok: false, error: { code: 'UNKNOWN_TOOL' } },
      { name: 'narrate', ok: true },
    ],
  });
  expect(ctx.narration).toEqual(narration);
  const messages = provider.requests[1]?.messages;
  expect(messages).toHaveLength(3);
  expect(messages?.[1]).toEqual({ role: 'assistant', content: before });
  expect(messages?.[2]).toMatchObject({
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'a',
      },
      {
        type: 'tool_result',
        tool_use_id: 'b',
        is_error: true,
      },
    ],
  });
  const results = messages?.[2]?.content;
  if (!Array.isArray(results)) throw new Error('Expected tool result blocks');
  const [success, error] = results;
  expect(success).not.toHaveProperty('is_error');
  expect(success && 'content' in success ? success.content : '').toContain(
    '"ok":true',
  );
  expect(error && 'content' in error ? error.content : '').toContain(
    'UNKNOWN_TOOL',
  );
  expect(provider.requests[0]?.messages).toHaveLength(1);
  for (const request of provider.requests) expect(request.cacheTail).toBe('5m');
  expect(content).toEqual(before);
  provider.assertDrained();
});

it('cap gives a narrate-now turn with identical tools and auto choice', async () => {
  const { dm, provider } = await fixture(
    [turn(call('set_attitude', attitude)), finish],
    configSchema.parse({ limits: { toolCalls: 1 } }),
  );
  expect((await dm.run()).status).toBe('narrated');
  const [first, last] = provider.requests;
  expect(first).toBeDefined();
  expect(last?.tools).toBe(first?.tools);
  expect(last?.system).toBe(first?.system);
  expect(last?.messages.at(-1)).toEqual({ role: 'user', content: NARRATE_NOW });
  for (const request of provider.requests) {
    expect(request.cacheTail).toBe('5m');
    expect(prepareRequest(request)).toMatchObject({
      tool_choice: { type: 'auto' },
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
  }
  provider.assertDrained();
});

it('without a narration error, returns noNarration after the finishing turn and rejects other calls', async () => {
  const { dm, provider, ctx } = await fixture(
    [
      turn(call('set_attitude', attitude)),
      turn(call('set_attitude', attitude)),
    ],
    configSchema.parse({ limits: { toolCalls: 1 } }),
  );
  const result = await dm.run();
  expect(result).toMatchObject({
    status: 'noNarration',
    narration: undefined,
    iterations: 2,
  });
  expect(result.toolCalls.at(-1)).toMatchObject({
    ok: false,
    error: { code: 'NARRATION_REQUIRED' },
  });
  expect(ctx.events).toHaveLength(1);
  provider.assertDrained();
});

it('plain text without narrate gets only one finishing turn', async () => {
  const { dm, provider } = await fixture([
    { type: 'text', text: 'You pause.' },
    { type: 'text', text: 'Still no tool.' },
  ]);
  expect(await dm.run()).toMatchObject({
    status: 'noNarration',
    iterations: 2,
    narration: undefined,
  });
  expect(provider.requests[1]?.messages.slice(1)).toEqual([
    { role: 'assistant', content: [{ type: 'text', text: 'You pause.' }] },
    { role: 'user', content: NARRATE_NOW },
  ]);
});

it.each([false, true])(
  'max_tokens is a failed turn, including tool blocks=%s',
  async (withTools) => {
    const content: LlmContentBlock[] = [
      { type: 'thinking', thinking: 'Partial', signature: 'unchanged' },
      ...(withTools ? [call('set_attitude', attitude)] : []),
    ];
    const { dm, provider, ctx } = await fixture([
      {
        type: 'response',
        response: response({ stopReason: 'max_tokens', content }),
      },
      finish,
    ]);
    const result = await dm.run();
    expect(result).toMatchObject({
      status: 'narrated',
      iterations: 2,
      costUsd: 0.01,
      latencyMs: 15,
    });
    expect(ctx.events).toEqual([]);
    expect(provider.requests[1]?.messages[1]?.content).toBe(content);
    expect(provider.requests[1]?.messages.at(-1)?.content).toBe(NARRATE_NOW);
    if (withTools) {
      expect(result.toolCalls[0]).toMatchObject({
        ok: false,
        error: { code: 'FAILED_TURN' },
      });
      expect(provider.requests[1]?.messages[2]).toMatchObject({
        role: 'user',
        content: [{ tool_use_id: 'set_attitude', is_error: true }],
      });
    }
  },
);

it('returns refused without executing refusal content and counts its usage', async () => {
  const refused = response({
    stopReason: 'refusal',
    content: [call('set_attitude', attitude)],
    fallbackUsed: true,
  });
  const error = new LlmRefusalError('dm', 'claude-opus-5-5', null, refused);
  const { dm, ctx } = await fixture([{ type: 'error', error }]);
  expect(await dm.run()).toMatchObject({
    status: 'refused',
    narration: undefined,
    toolCalls: [],
    iterations: 1,
    usage: refused.usage,
    iterationUsage: [{ iteration: 1, usage: refused.usage }],
    costUsd: 0.01,
    latencyMs: 15,
    fallbackUsed: true,
  });
  expect(ctx.events).toEqual([]);
});

it('records missing refusal usage as unknown instead of zero tokens', async () => {
  const { dm } = await fixture([{ type: 'refusal' }]);
  expect(await dm.run()).toMatchObject({
    status: 'refused',
    iterations: 1,
    iterationUsage: [{ iteration: 1, usage: null }],
  });
});

it('propagates unavailability so the orchestrator can roll back', async () => {
  const error = new LlmUnavailableError('dm', 'claude-opus-5-5', 'offline');
  const { dm } = await fixture([{ type: 'error', error }]);
  await expect(dm.run()).rejects.toBe(error);
});

it('aggregates usage, cache TTL buckets, cost and latency without a clock', async () => {
  const secondUsage = {
    inputTokens: 2,
    outputTokens: 7,
    cacheCreationInputTokens: 10,
    cacheReadInputTokens: 50,
    cacheCreation: { ephemeral5mInputTokens: 10, ephemeral1hInputTokens: 0 },
  };
  const { dm } = await fixture([
    {
      type: 'response',
      response: response({
        stopReason: 'tool_use',
        content: [call('set_attitude', attitude)],
        fallbackUsed: true,
      }),
    },
    {
      type: 'response',
      response: response({
        stopReason: 'tool_use',
        content: [call('narrate', narration)],
        usage: secondUsage,
      }),
    },
  ]);
  const result = await dm.run();
  expect(result).toMatchObject({
    iterations: 2,
    costUsd: 0.02,
    latencyMs: 30,
    fallbackUsed: true,
    usage: {
      inputTokens: 12,
      outputTokens: 12,
      cacheCreationInputTokens: 30,
      cacheReadInputTokens: 80,
      cacheCreation: { ephemeral5mInputTokens: 10, ephemeral1hInputTokens: 20 },
    },
  });
  expect(result.iterationUsage).toEqual([
    { iteration: 1, usage: response().usage },
    { iteration: 2, usage: secondUsage },
  ]);
  secondUsage.cacheCreation.ephemeral5mInputTokens = 999;
  expect(
    result.iterationUsage[1]?.usage?.cacheCreation.ephemeral5mInputTokens,
  ).toBe(10);
});

it('executes no calls after a successful narrate but traces their errors', async () => {
  const { dm, ctx } = await fixture([
    turn(
      call('narrate', narration, 'first'),
      call('set_attitude', attitude),
      call('narrate', { ...narration, text: 'Replacement' }, 'second'),
    ),
  ]);
  const result = await dm.run();
  expect(result.narration).toEqual(narration);
  expect(result.toolCalls.map((entry) => entry.ok)).toEqual([
    true,
    false,
    false,
  ]);
  expect(ctx.events).toEqual([]);
});

it('bounds repeated voice errors even though voice is outside the ordinary cap', async () => {
  const voice = turn(
    call('voice_npc', { npc: 'char:tobb', direction: 'Greet.' }),
  );
  const { dm, provider } = await fixture(
    [voice, voice, voice],
    configSchema.parse({ limits: { toolCalls: 1, voiceNpcPerBeat: 0 } }),
  );
  expect(await dm.run()).toMatchObject({
    status: 'noNarration',
    iterations: 3,
  });
  provider.assertDrained();
});
