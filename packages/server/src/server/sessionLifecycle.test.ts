import { expect, test } from 'vitest';
import { configSchema } from '@dungeon/shared';
import { LlmUnavailableError } from '../agents/llm/errors.js';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import { Session } from '../beat/Session.js';
import { pass, playerIntent } from '../beat/testing/harness.js';
import { memoryHarness } from './testing/memoryHarness.js';
import { winningScript } from './testing/winningScript.js';

test.each([false, true])(
  'pause diagnostics and refreshed countdown obey developer gating (%s)',
  async (dev) => {
    const provider = new ScriptedProvider({
      peer: [pass, pass],
      dm: [
        {
          type: 'error',
          error: new LlmUnavailableError(
            'dm',
            'scripted',
            'private provider details',
          ),
        },
      ],
    });
    const live = await memoryHarness({ provider, dev });
    const client = await live.connect();
    await live.receive(client, playerIntent());
    const paused = client.messages.at(-1);
    if (paused?.type !== 'paused') throw new Error('Missing pause');
    expect(paused.retryInMs).toBe(5000);
    expect(paused.errorCode).toBe(dev ? 'LlmUnavailableError' : undefined);
    expect(paused.traceId).toBe(dev ? 'beat-1-0' : undefined);
    expect(client.raw.join('')).not.toContain('private provider details');
    await live.clock.advance(2000);
    const observer = await live.connect();
    expect(observer.messages.at(-1)).toMatchObject({
      type: 'paused',
      retryInMs: 3000,
    });
  },
);

test('custom budget increments are advertised on hello and persist after raising', async () => {
  const live = await memoryHarness({
    config: configSchema.parse({ budget: { sessionUsd: 0, stepUsd: 2.5 } }),
  });
  const client = await live.connect();
  expect(client.messages.at(-1)).toMatchObject({
    type: 'paused',
    budgetStepUsd: 2.5,
    retryInMs: null,
  });
  await live.receive(client, {
    type: 'session_command',
    command: 'raise_budget',
  });
  expect(live.app.sessionHost.session?.budgetUsd).toBe(2.5);
  await live.receive(client, {
    type: 'session_command',
    command: 'save_and_quit',
  });
  expect(client.messages.at(-1)).toMatchObject({
    type: 'session_saved',
    beat: 0,
  });
});

test('new run explicitly starts from seed even when the host factory resumed an ended log', async () => {
  const live = await memoryHarness({ ...winningScript() });
  const driver = await live.connect();
  for (let beat = 0; beat < 3; beat++)
    await live.receive(driver, playerIntent());
  await live.app.close();
  const resumed = await memoryHarness({
    dataDir: live.dataDir,
    dev: true,
    sessionFactory: (options) => Session.resume('memory-session', options),
  });
  const client = await resumed.connect();
  expect(resumed.app.sessionHost.session?.beat).toBe(3);
  await resumed.receive(client, {
    type: 'session_command',
    command: 'start_new_run',
  });
  expect(resumed.app.sessionHost.session?.beat).toBe(0);
  expect(resumed.app.sessionHost.session?.id).not.toBe('memory-session');
  expect(resumed.app.sessionHost.session?.state.status).toBe('running');
});
