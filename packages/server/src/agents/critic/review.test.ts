import { expect, it } from 'vitest';
import { call, finish, turn } from '../dm/testing.js';
import { LlmUnavailableError } from '../llm/errors.js';
import { reviewBeat } from './review.js';
import { issue, proposal, reject, setup, verdict } from './testing.js';

it('accepts on the first review, with no retry or extra events', async () => {
  const f = await setup([finish]);
  f.provider.enqueue('critic', verdict());
  const initial = await f.dm.run();
  const result = await reviewBeat({ ...f.options, result: initial });
  expect(result).toMatchObject({
    narration: initial.narration,
    verdicts: [{ ok: true }],
    retry: { attempted: false },
    fallback: false,
  });
  expect(f.ctx.events).toEqual([]);
  f.provider.assertDrained();
});

it('rejects once, retries through the real DM, then accepts', async () => {
  const f = await setup([finish, turn(call('narrate', proposal))]);
  f.provider.enqueue('critic', reject, verdict());
  const result = await reviewBeat({ ...f.options, result: await f.dm.run() });
  expect(result.verdicts).toEqual([
    { ok: false, issues: [issue] },
    { ok: true },
  ]);
  expect(result.narration).toEqual(proposal);
  expect(result.retry).toEqual({ attempted: true, status: 'narrated' });
  expect(result.fallback).toBe(false);
  expect(
    JSON.stringify(
      f.provider.requests.filter(({ role }) => role === 'dm').at(-1)?.messages,
    ),
  ).toContain(issue.explanation);
  f.provider.assertDrained();
});

it('rejects twice then replaces the proposal with a deterministic summary', async () => {
  const f = await setup([finish, finish]);
  f.provider.enqueue('critic', reject, reject);
  const result = await reviewBeat({ ...f.options, result: await f.dm.run() });
  expect(result.fallback).toBe(true);
  expect(result.verdicts).toHaveLength(2);
  expect(result.narration).toEqual({
    text: 'You notice no further change.',
    lines: [],
  });
  expect(f.ctx.narration).toEqual(result.narration);
  expect(f.ctx.finished).toBe(true);
  f.provider.assertDrained();
});

it.each(['refusal', 'noNarration'])(
  'falls back directly on initial DM %s',
  async (failure) => {
    const f = await setup(
      failure === 'refusal'
        ? [{ type: 'refusal' }]
        : [
            { type: 'text', text: 'No tools.' },
            { type: 'text', text: 'Still no tools.' },
          ],
    );
    const result = await reviewBeat({ ...f.options, result: await f.dm.run() });
    expect(result.fallback).toBe(true);
    expect(result.verdicts).toEqual([]);
    expect(result.retry.attempted).toBe(false);
    f.provider.assertDrained();
  },
);

it.each(['refusal', 'noNarration'])(
  'falls back on retry DM %s',
  async (failure) => {
    const f = await setup(
      failure === 'refusal'
        ? [finish, { type: 'refusal' }]
        : [
            finish,
            { type: 'text', text: 'No tools.' },
            { type: 'text', text: 'Still no tools.' },
          ],
    );
    f.provider.enqueue('critic', reject);
    const result = await reviewBeat({ ...f.options, result: await f.dm.run() });
    expect(result.fallback).toBe(true);
    expect(result.verdicts).toHaveLength(1);
    expect(result.retry.attempted).toBe(true);
    f.provider.assertDrained();
  },
);

it('falls back without inventing a verdict on critic failure', async () => {
  const f = await setup([finish]);
  f.provider.enqueue('critic', { type: 'refusal' });
  const result = await reviewBeat({ ...f.options, result: await f.dm.run() });
  expect(result).toMatchObject({
    fallback: true,
    verdicts: [null],
    flags: { criticFailed: true },
  });
  expect(result.retry.attempted).toBe(false);
});

it('propagates critic or retry DM unavailability without silently accepting', async () => {
  for (const role of ['critic', 'dm'] as const) {
    const error = new LlmUnavailableError(role, 'model', 'offline');
    const f = await setup(
      role === 'dm' ? [finish, { type: 'error', error }] : [finish],
    );
    f.provider.enqueue(
      'critic',
      role === 'critic' ? { type: 'error', error } : reject,
    );
    await expect(
      reviewBeat({ ...f.options, result: await f.dm.run() }),
    ).rejects.toBe(error);
  }
});

it('allows the real DM to repair an unbacked outcome with extra tools', async () => {
  const f = await setup([
    finish,
    turn(
      call('set_attitude', {
        from: 'char:ilsa',
        to: 'char:kael',
        delta: 5,
        reason: 'Helped.',
      }),
      call('narrate', proposal),
    ),
  ]);
  f.provider.enqueue(
    'critic',
    verdict({
      verdict: { ok: false, issues: [{ ...issue, type: 'unbacked_outcome' }] },
    }),
    verdict(),
  );
  const result = await reviewBeat({ ...f.options, result: await f.dm.run() });
  expect(result.fallback).toBe(false);
  expect(result.dmResult.toolCalls).toContainEqual(
    expect.objectContaining({ name: 'set_attitude', ok: true }),
  );
  expect(f.ctx.events).toContainEqual(
    expect.objectContaining({ type: 'AttitudeChanged' }),
  );
});
