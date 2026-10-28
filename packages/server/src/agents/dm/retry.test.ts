import { configSchema } from '@dungeon/shared';
import type { CriticIssue } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { attitude, call, finish, fixture, narration, turn } from './testing.js';

const perspective: CriticIssue = {
  type: 'perspective_leak',
  quote: 'You know.',
  explanation: 'The player has not learned this.',
};
const unbacked: CriticIssue = {
  type: 'unbacked_outcome',
  quote: 'Taken.',
  explanation: 'No transfer event supports this claim.',
};

it('continues the same conversation, rejects state and voice tools, and accepts replacement narration', async () => {
  const { dm, provider, ctx, npcVoice } = await fixture([
    finish,
    turn(
      call('set_attitude', attitude),
      call('voice_npc', { npc: 'char:tobb', direction: 'Greet.' }),
    ),
    turn(call('narrate', { ...narration, text: 'You watch the hearth.' })),
  ]);
  const original = await dm.run();
  const result = await dm.retryNarration([perspective]);
  expect(result).toMatchObject({
    status: 'narrated',
    iterations: 3,
    narration: { text: 'You watch the hearth.' },
  });
  expect(original).toMatchObject({ narration, iterations: 1 });
  expect(original.iterationUsage).toHaveLength(1);
  expect(result.iterationUsage.map(({ iteration }) => iteration)).toEqual([
    1, 2, 3,
  ]);
  expect(result.iterationUsage[0]).toEqual(original.iterationUsage[0]);
  expect(result.iterationUsage[0]).not.toBe(original.iterationUsage[0]);
  expect(ctx.events).toEqual([]);
  expect(npcVoice.voice).not.toHaveBeenCalled();
  expect(provider.requests[1]?.messages.slice(0, 1)).toEqual(
    provider.requests[0]?.messages,
  );
  expect(provider.requests[1]?.messages[1]).toMatchObject({
    role: 'assistant',
    content: [{ type: 'tool_use', name: 'narrate' }],
  });
  expect(provider.requests[1]?.messages[2]).toMatchObject({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'narrate' }],
  });
  expect(provider.requests[1]?.messages.at(-1)?.content).toContain(
    'perspective_leak',
  );
  expect(provider.requests[2]?.messages.at(-2)).toMatchObject({
    role: 'user',
    content: [
      { tool_use_id: 'set_attitude', is_error: true },
      { tool_use_id: 'voice_npc', is_error: true },
    ],
  });
  expect(result.toolCalls.slice(1, 3).map((entry) => entry.ok)).toEqual([
    false,
    false,
  ]);
  expect(
    provider.requests.every(
      (request) => request.tools === provider.requests[0]?.tools,
    ),
  ).toBe(true);
  for (const request of provider.requests) expect(request.cacheTail).toBe('5m');
  await expect(dm.retryNarration([perspective])).rejects.toThrow(
    'exactly one critic retry',
  );
  provider.assertDrained();
});

it('unbacked_outcome permits two extra validated calls after the original cap, never three', async () => {
  const { dm, ctx, provider } = await fixture(
    [
      turn(
        call('set_attitude', attitude, 'initial'),
        call('narrate', narration),
      ),
      turn(call('set_attitude', attitude, 'retry-1')),
      turn(
        call('set_attitude', attitude, 'retry-2'),
        call('set_attitude', attitude, 'retry-3'),
        call('narrate', narration),
      ),
    ],
    configSchema.parse({ limits: { toolCalls: 1 } }),
  );
  await dm.run();
  const result = await dm.retryNarration([perspective, unbacked]);
  expect(result.status).toBe('narrated');
  expect(result.toolCalls.map((entry) => entry.ok)).toEqual([
    true,
    true,
    true,
    true,
    false,
    true,
  ]);
  expect(ctx.events).toHaveLength(3);
  expect(ctx.counters.toolCalls).toBe(3);
  expect(ctx.toolCallLimit).toBe(3);
  expect(result.toolCalls[4]).toMatchObject({
    error: { code: 'NARRATION_ONLY' },
  });
  expect(provider.requests[2]?.messages.at(-1)).toMatchObject({
    content: [{ tool_use_id: 'retry-1' }],
  });
});

it.each([0, 1, 2, 5])(
  'honours configured retry allowance %i up to the spec ceiling',
  async (limit) => {
    const { dm, ctx } = await fixture(
      [
        finish,
        turn(
          ...[0, 1, 2].map((index) =>
            call('set_attitude', attitude, `a${index}`),
          ),
          call('narrate', narration),
        ),
      ],
      configSchema.parse({
        limits: { retryToolCallsForUnbackedOutcome: limit },
      }),
    );
    await dm.run();
    const result = await dm.retryNarration([unbacked]);
    expect(result.status).toBe('narrated');
    expect(ctx.events).toHaveLength(Math.min(limit, 2));
  },
);

it('failed attempts consume retry allowance and never bypass engine validation', async () => {
  const { dm, ctx } = await fixture([
    finish,
    turn(
      call('move', { actor: 'char:missing', to: 'loc:kitchen' }),
      call('unknown', {}),
      call('set_attitude', attitude),
      call('narrate', narration),
    ),
  ]);
  await dm.run();
  const result = await dm.retryNarration([unbacked]);
  expect(result.toolCalls.map((entry) => entry.ok)).toEqual([
    true,
    false,
    false,
    false,
    true,
  ]);
  expect(ctx.events).toEqual([]);
});

it('a retry that never narrates clears rejected narration and reports noNarration', async () => {
  const { dm, ctx } = await fixture([
    finish,
    { type: 'text', text: 'No tool' },
    { type: 'text', text: 'Still no tool' },
  ]);
  await dm.run();
  expect(await dm.retryNarration([perspective])).toMatchObject({
    status: 'noNarration',
    narration: undefined,
    iterations: 3,
  });
  expect(ctx.narration).toBeUndefined();
});

it('requires a completed initial narration and issues, and cannot run twice', async () => {
  const { dm } = await fixture([finish]);
  await expect(dm.retryNarration([perspective])).rejects.toThrow(
    'completed narration',
  );
  await dm.run();
  await expect(dm.retryNarration([])).rejects.toThrow('requires critic issues');
  await expect(dm.run()).rejects.toThrow('only run once');
});
