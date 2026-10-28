import { describe, expect, it } from 'vitest';
import { beatResultSchema } from '@dungeon/shared';
import type { ServerMessage } from '@dungeon/shared';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import { LlmUnavailableError } from '../agents/llm/errors.js';
import type { LlmProvider, LlmRequest } from '../agents/llm/types.js';
import { readEventLog } from '../ontology/eventLog.js';
import {
  accepted,
  calls,
  check,
  deferred,
  harness,
  narrate,
  pass,
  playerIntent,
  script,
  traceFile,
} from './testing/harness.js';

it('commits a golden beat with exact events, narration and witnessed rolls', async () => {
  const provider = new ScriptedProvider({
    peer: [pass, pass],
    dm: [calls(check, narrate)],
    critic: [accepted],
  });
  const { session, dataDir } = await harness({ provider });
  const result = await session.submitIntent(playerIntent());
  expect(session.records.map(({ type }) => type)).toEqual([
    'SeedLoaded',
    'BeatCommitted',
    'BeatStarted',
    'IntentReceived',
    'CheckRolled',
    'NarrationCommitted',
    'BeatCommitted',
  ]);
  expect(result?.records).toMatchSnapshot();
  expect(result?.result).toMatchSnapshot();
  expect(
    result?.result.events.every(({ witnesses }) =>
      witnesses.includes('char:kael'),
    ),
  ).toBe(true);
  expect(beatResultSchema.parse(result?.result)).toEqual(result?.result);
  expect(await traceFile(dataDir)).toMatchObject({
    outcome: 'committed',
    costUsd: 0,
    metrics: { toolCalls: 2, toolErrors: 0 },
  });
  expect((await readEventLog(dataDir, session.id)).records).toEqual(
    session.records,
  );
  provider.assertDrained();
});

it('starts both peers in parallel and emits each provisional line before commit', async () => {
  const starts = deferred<void>();
  const gates = [deferred<void>(), deferred<void>()];
  let peerCount = 0;
  const speech = {
    kind: 'intent',
    text: 'Listen.',
    refs: [],
    say: 'Keep your ears open.',
    private: false,
  };
  const scripted = new ScriptedProvider({
    peer: [{ type: 'structured', output: speech }, pass],
    dm: [calls(narrate)],
    critic: [accepted],
  });
  const provider: LlmProvider = {
    async complete<T>(request: LlmRequest<T>) {
      if (request.role === 'peer') {
        const gate = gates[peerCount++];
        if (peerCount === 2) starts.resolve();
        await gate?.promise;
      }
      return scripted.complete(request);
    },
  };
  const progress = deferred<void>();
  const messages: ServerMessage[] = [];
  const { session, dataDir } = await harness({
    provider,
    onMessage(message) {
      messages.push(message);
      if (message.type === 'beat_progress') progress.resolve();
    },
  });
  const pending = session.submitIntent(playerIntent());
  await starts.promise;
  expect(peerCount).toBe(2);
  gates[0]?.resolve();
  await progress.promise;
  expect(messages.at(-1)?.type).toBe('beat_progress');
  expect(
    (await readEventLog(dataDir, session.id)).records.map(({ beat }) => beat),
  ).toEqual([0, 0]);
  gates[1]?.resolve();
  await pending;
  expect(messages.map(({ type }) => type)).toEqual([
    'beat_started',
    'beat_progress',
    'beat_result',
  ]);
});

it('rolls back a failed DM attempt including rotation and generated draft state', async () => {
  const provider = new ScriptedProvider({
    peer: [pass, pass],
    dm: [
      calls(
        { name: 'move', input: { actor: 'char:kael', to: 'char:brann' } },
        check,
      ),
      {
        type: 'error',
        error: new LlmUnavailableError('dm', 'scripted', 'offline'),
      },
    ],
  });
  const { session, store, dataDir } = await harness({ provider });
  const before = session.engine.snapshot();
  const graph = { nodes: await store.nodes(), edges: await store.edges() };
  const rotation = session.rotation;
  expect(await session.submitIntent(playerIntent())).toBeUndefined();
  expect(session.engine.snapshot()).toEqual(before);
  expect(session.rotation).toEqual(rotation);
  expect({ nodes: await store.nodes(), edges: await store.edges() }).toEqual(
    graph,
  );
  expect((await readEventLog(dataDir, session.id)).records).toEqual(
    session.records,
  );
  expect(await traceFile(dataDir)).toMatchObject({
    outcome: 'aborted',
    events: [],
  });
  expect(await traceFile(dataDir)).toHaveProperty('toolCalls.0', {
    name: 'move',
    input: { actor: 'char:kael', to: 'char:brann' },
    ok: true,
  });
});

it.each([
  'item:quill',
  'container:floorboard',
  // Marta is in the walled kitchen, out of the player's sight.
  'char:marta',
  'char:missing',
] as const)(
  'rejects invisible or missing selection %s with the id',
  async (id) => {
    const { session, provider } = await harness();
    await expect(
      session.submitIntent({ ...playerIntent(), selection: [id] }),
    ).rejects.toThrow(`INVALID_SELECTION: ${id}`);
    expect(session.state).toEqual({ status: 'running' });
    expect(session.records).toHaveLength(2);
    expect(provider instanceof ScriptedProvider && provider.requests).toEqual(
      [],
    );
  },
);

describe('wall clock isolation', () => {
  it('times out at 120 seconds and ignores late provider work', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const scripted = script();
    let slow = true;
    const provider: LlmProvider = {
      async complete<T>(request: LlmRequest<T>) {
        if (request.role === 'dm' && slow) {
          entered.resolve();
          await release.promise;
        }
        return scripted.complete(request);
      },
    };
    const { session, clock, dataDir } = await harness({ provider });
    const snapshot = session.engine.snapshot();
    const pending = session.submitIntent(playerIntent());
    await entered.promise;
    await clock.advance(120_000);
    await pending;
    expect(session.state).toMatchObject({
      status: 'paused',
      reason: 'llm_unavailable',
    });
    release.resolve();
    slow = false;
    await session.drain();
    expect(session.engine.snapshot()).toEqual(snapshot);
    expect((await readEventLog(dataDir, session.id)).records).toHaveLength(2);
  });
});
