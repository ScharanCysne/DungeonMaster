import { expect, it, vi } from 'vitest';
import { configSchema } from '@dungeon/shared';
import { Session } from '../beat/Session.js';
import {
  accepted,
  calls,
  check,
  deferred,
  narrate,
  pass,
  playerIntent,
} from '../beat/testing/harness.js';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import type { LlmProvider, LlmRequest } from '../agents/llm/types.js';
import { serializeServerMessage } from './wire.js';
import { serverHarness } from './testing/harness.js';
import { requireLoopback } from './testing/loopback.js';

requireLoopback();

it('healthz responds with JSON over HTTP', async () => {
  const { address } = await serverHarness();
  const response = await fetch(`${address}/healthz`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

it('round-trips hello, progress and a committed beat through native WebSocket', async () => {
  const provider = new ScriptedProvider({
    peer: [
      {
        type: 'structured',
        output: {
          kind: 'intent',
          text: 'Listen.',
          refs: [],
          private: false,
          say: 'Stay alert.',
        },
      },
      pass,
    ],
    dm: [calls(check, narrate)],
    critic: [accepted],
  });
  const { connect, app } = await serverHarness({ provider });
  const client = await connect();
  expect(client.messages[0]).toMatchObject({
    type: 'world_snapshot',
    beat: 0,
    mapId: 'tavern',
  });
  client.send(playerIntent());
  expect(await client.next('beat_started')).toEqual({
    type: 'beat_started',
    beat: 1,
  });
  expect(await client.next('beat_progress')).toMatchObject({
    progress: { kind: 'status', phase: 'peers' },
  });
  const result = await client.next('beat_result');
  expect(result).toMatchObject({
    beat: 1,
    traceId: 'beat-1-0',
    narration: narrate.input,
  });
  expect(result.rolls).toHaveLength(1);
  expect(
    result.events.every(({ witnesses }) => witnesses.includes('char:kael')),
  ).toBe(true);
  expect(
    client.messages.some(
      (message) =>
        message.type === 'beat_progress' &&
        message.progress.kind === 'peer_line' &&
        message.progress.text === 'Stay alert.',
    ),
  ).toBe(true);
  await app.sessionHost.idle();
  provider.assertDrained();
});

it.each([
  '{',
  '{"type":"nope"}',
  '{"type":"hello"}',
  '{"type":"player_intent","selection":[],"text":9}',
  '{"type":"hello","episodeId":"episode-n","extra":true}',
])('rejects malformed input and keeps the socket usable: %s', async (raw) => {
  const { connect } = await serverHarness();
  const client = await connect(false);
  client.socket.send(raw);
  const error = await client.next('error');
  expect(error.code).toBe('BAD_MESSAGE');
  expect(error.message).toMatch(/JSON|type|episodeId|text|message/);
  client.send({ type: 'hello', episodeId: 'episode-n' });
  expect(await client.next('world_snapshot')).toMatchObject({ beat: 0 });
});

it('rejects binary messages without closing', async () => {
  const { connect } = await serverHarness();
  const client = await connect();
  client.socket.send(new Uint8Array([1, 2]));
  expect(await client.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
  client.send({ type: 'hello', episodeId: 'episode-n' });
  await client.next('world_snapshot');
});

it('validates outbound messages, including server callbacks swallowed by Session', async () => {
  expect(() =>
    serializeServerMessage({ type: 'beat_started', beat: -1 }),
  ).toThrow();
  const { connect, app } = await serverHarness({
    async sessionFactory(options) {
      const session = await Session.start(options);
      try {
        options.onMessage?.({ type: 'beat_started', beat: -1 });
      } catch {
        /* Session observers may catch errors. */
      }
      return session;
    },
  });
  const client = await connect();
  await expect(app.sessionHost.flush()).rejects.toThrow();
  expect(
    client.messages.some((message) => message.type === 'beat_started'),
  ).toBe(false);
});

it('requires hello, validates the episode and refuses future reconnect beats', async () => {
  const { connect } = await serverHarness();
  const client = await connect(false);
  client.send(playerIntent());
  expect(await client.next('error')).toMatchObject({ code: 'HELLO_REQUIRED' });
  client.send({ type: 'hello', episodeId: 'unknown' });
  expect(await client.next('error')).toMatchObject({ code: 'UNKNOWN_EPISODE' });
  client.send({ type: 'hello', episodeId: 'episode-n', lastSeenBeat: 2 });
  expect(await client.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
  client.send({ type: 'hello', episodeId: 'episode-n' });
  await client.next('world_snapshot');
});

it('forwards session commands and pause/resume through Session', async () => {
  const { connect, app } = await serverHarness({
    config: configSchema.parse({ budget: { sessionUsd: 0 } }),
  });
  const client = await connect();
  expect(await client.next('paused')).toMatchObject({
    reason: 'budget',
    retryInMs: null,
  });
  client.send({ type: 'session_command', command: 'raise_budget' });
  expect(await client.next('resumed')).toEqual({ type: 'resumed', beat: 1 });
  client.send(playerIntent());
  await client.next('beat_result');
  client.send({ type: 'session_command', command: 'save_and_quit' });
  await vi.waitFor(() =>
    expect(app.sessionHost.session?.state.status).toBe('ended'),
  );
  client.send(playerIntent());
  expect(await client.next('error')).toMatchObject({ code: 'EPISODE_ENDED' });
});

it('rejects concurrent intents rather than queuing another beat', async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const scripted = new ScriptedProvider({
    peer: [pass, pass],
    dm: [calls(narrate)],
    critic: [accepted],
  });
  const provider: LlmProvider = {
    async complete<T>(request: LlmRequest<T>) {
      if (request.role === 'dm') {
        entered.resolve();
        await gate.promise;
      }
      return scripted.complete(request);
    },
  };
  const { connect } = await serverHarness({ provider });
  const client = await connect();
  client.send(playerIntent());
  await entered.promise;
  client.send(playerIntent());
  expect(await client.next('error')).toMatchObject({
    code: 'BEAT_IN_PROGRESS',
  });
  gate.resolve();
  await client.next('beat_result');
  scripted.assertDrained();
});
