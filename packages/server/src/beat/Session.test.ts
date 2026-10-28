import { describe, expect, it } from 'vitest';
import { configSchema } from '@dungeon/shared';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import { LlmUnavailableError } from '../agents/llm/errors.js';
import { Session } from './Session.js';
import {
  accepted,
  calls,
  check,
  harness,
  narrate,
  pass,
  playerIntent,
  script,
  traceFile,
} from './testing/harness.js';

const unavailable = {
  type: 'error',
  error: new LlmUnavailableError('dm', 'scripted', 'offline'),
} as const;
const command = (command: 'retry_now' | 'save_and_quit' | 'raise_budget') =>
  ({ type: 'session_command', command }) as const;

it('pauses, schedules 5 seconds, then reruns once with attempt + 1', async () => {
  const provider = new ScriptedProvider({
    peer: [
      pass,
      pass,
      { type: 'structured', output: { ready: true } },
      pass,
      pass,
    ],
    dm: [calls(check), unavailable, calls(check, narrate)],
    critic: [accepted],
  });
  const { session, clock, dataDir } = await harness({ provider });
  await session.submitIntent(playerIntent());
  expect(session.state).toEqual({
    status: 'paused',
    reason: 'llm_unavailable',
    beat: 1,
    attempt: 0,
    retryAt: 5000,
  });
  await expect(session.submitIntent(playerIntent())).rejects.toThrow(
    'SESSION_PAUSED',
  );
  await clock.advance(4999);
  expect(session.beat).toBe(0);
  await clock.advance(1);
  expect(session.state).toEqual({ status: 'running' });
  expect(session.beat).toBe(1);
  expect(
    session.records.find(({ type }) => type === 'BeatStarted')?.payload,
  ).toEqual({ attempt: 1 });
  expect(session.engine.state.attempt).toBe(1);
  expect(await traceFile(dataDir, 1, 0)).toMatchObject({ outcome: 'aborted' });
  expect(await traceFile(dataDir, 1, 1)).toMatchObject({
    outcome: 'committed',
  });
  await clock.advance(600_000);
  expect(session.beat).toBe(1);
  provider.assertDrained();
});

it('uses 5/10/20/40/60-second health checks and stops before ten minutes', async () => {
  const provider = new ScriptedProvider({
    peer: [pass, pass, pass, pass],
    dm: [unavailable, calls(narrate)],
    critic: [accepted],
  });
  let healthy = false;
  let checks = 0;
  const { session, clock } = await harness({
    provider,
    healthCheck: () => {
      checks++;
      return Promise.resolve(healthy);
    },
  });
  await session.submitIntent(playerIntent());
  for (const [delay, next] of [
    [5000, 15000],
    [10000, 35000],
    [20000, 75000],
    [40000, 135000],
    [60000, 195000],
  ]) {
    await clock.advance(delay ?? 0);
    expect(session.state).toMatchObject({ retryAt: next });
  }
  await clock.advance(600_000);
  expect(session.state).toMatchObject({
    status: 'paused',
    retryAt: null,
    attempt: 0,
  });
  expect(clock.tasks.size).toBe(0);
  expect(checks).toBe(12);
  healthy = true;
  await session.command(command('retry_now'));
  expect(session.beat).toBe(1);
  provider.assertDrained();
});

it('keeps the retry horizon across repeated failed beat attempts', async () => {
  const provider = new ScriptedProvider({
    peer: Array.from({ length: 26 }, () => pass),
    dm: Array.from({ length: 13 }, () => unavailable),
  });
  const { session, clock } = await harness({
    provider,
    healthCheck: () => Promise.resolve(true),
  });
  await session.submitIntent(playerIntent());
  await clock.advance(600_000);
  expect(session.state).toMatchObject({
    status: 'paused',
    retryAt: null,
    attempt: 12,
  });
  provider.assertDrained();
});

it('waits for explicit retry on an internal error', async () => {
  const provider = new ScriptedProvider({
    peer: [pass, pass, pass, pass],
    dm: [
      { type: 'error', error: new Error('broken invariant') },
      calls(narrate),
    ],
    critic: [accepted],
  });
  const { session, clock } = await harness({ provider });
  await session.submitIntent(playerIntent());
  expect(session.state).toMatchObject({
    status: 'paused',
    reason: 'internal_error',
    retryAt: null,
  });
  expect(clock.tasks.size).toBe(0);
  await session.command(command('retry_now'));
  expect(session.beat).toBe(1);
});

describe('budget', () => {
  it('starts paused at a zero budget and raising it adds the configured step', async () => {
    const { session } = await harness({
      config: configSchema.parse({ budget: { sessionUsd: 0, stepUsd: 5 } }),
    });
    expect(session.state).toMatchObject({
      status: 'paused',
      reason: 'budget',
      retryAt: null,
    });
    await session.command(command('retry_now'));
    expect(session.state.status).toBe('paused');
    await session.command(command('raise_budget'));
    expect(session.budgetUsd).toBe(5);
    expect(session.state.status).toBe('running');
    await session.submitIntent(playerIntent());
    expect(session.beat).toBe(1);
  });
  it('counts all traced roles, pauses after the commit, and persists the raised cap', async () => {
    const base = script();
    const provider = {
      async complete<T>(request: Parameters<typeof base.complete<T>>[0]) {
        return { ...(await base.complete(request)), costUsd: 0.25 };
      },
    };
    const { session, settings } = await harness({
      provider,
      config: configSchema.parse({ budget: { sessionUsd: 1 } }),
    });
    await session.submitIntent(playerIntent());
    expect(session.beat).toBe(1);
    expect(session.costUsd).toBe(1);
    expect(session.state).toMatchObject({ reason: 'budget' });
    await session.command(command('raise_budget'));
    expect(session.budgetUsd).toBe(6);
    const resumed = await Session.resume(session.id, settings);
    expect(resumed.costUsd).toBe(1);
    expect(resumed.budgetUsd).toBe(6);
    expect(resumed.state).toEqual({ status: 'running' });
  });
});
