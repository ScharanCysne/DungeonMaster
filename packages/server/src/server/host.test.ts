import { expect, it } from 'vitest';
import { configSchema } from '@dungeon/shared';
import { LlmUnavailableError } from '../agents/llm/errors.js';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import {
  accepted,
  calls,
  content,
  narrate,
  pass,
  playerIntent,
} from '../beat/testing/harness.js';
import { heartbeat } from './heartbeat.js';
import { memoryHarness, MemorySocket } from './testing/memoryHarness.js';
import {
  forbiddenSeedStrings,
  winningScript,
} from './testing/winningScript.js';
import { parseClientMessage, serializeServerMessage } from './wire.js';

it('serves healthz and runs the actual Session protocol with injected dependencies', async () => {
  const { app, connect, receive } = await memoryHarness();
  expect((await app.inject('/healthz')).json()).toEqual({ status: 'ok' });
  const client = await connect();
  expect(client.messages[0]).toMatchObject({
    type: 'world_snapshot',
    beat: 0,
    mapId: 'tavern',
  });
  await receive(client, playerIntent());
  expect(client.messages.map(({ type }) => type)).toContain('beat_started');
  expect(client.messages.map(({ type }) => type)).toContain('beat_progress');
  expect(client.messages.at(-1)).toMatchObject({
    type: 'beat_result',
    beat: 1,
  });
});

it('keeps malformed input errors safe and usable', async () => {
  const { connect, receive } = await memoryHarness();
  const client = await connect(false);
  await receive(client, '{');
  expect(client.messages.at(-1)).toMatchObject({ code: 'BAD_MESSAGE' });
  await receive(client, { type: 'hello', episodeId: 'episode-n' });
  expect(client.messages.at(-1)?.type).toBe('world_snapshot');
  expect(() =>
    parseClientMessage('{"type":"player_intent","selection":[],"text":5}'),
  ).toThrow('text');
  expect(() =>
    serializeServerMessage({ type: 'beat_started', beat: -1 }),
  ).toThrow();
});

it.each([false, true])(
  'enforces the complete session visibility boundary (dev %s)',
  async (dev) => {
    const script = winningScript();
    const { connect, receive, app } = await memoryHarness({ ...script, dev });
    const client = await connect();
    for (let beat = 0; beat < 3; beat++) await receive(client, playerIntent());
    expect(app.sessionHost.session?.state.status).toBe('ended');
    expect(client.messages.at(-1)).toMatchObject({
      type: 'episode_ended',
      holder: 'char:ilsa',
    });
    const results = client.messages.filter(
      (message) => message.type === 'beat_result',
    );
    expect(results).toHaveLength(3);
    if (dev)
      expect(results.every((result) => result.groundTruth !== undefined)).toBe(
        true,
      );
    else
      for (const forbidden of forbiddenSeedStrings())
        expect(client.raw.join('\n')).not.toContain(
          JSON.stringify(forbidden).slice(1, -1),
        );
    script.provider.assertDrained();
  },
);

it('resends exactly the missed immutable results after reconnect', async () => {
  const { connect, receive } = await memoryHarness();
  const driver = await connect();
  const observer = await connect();
  await receive(driver, playerIntent());
  observer.close();
  await receive(driver, playerIntent());
  await receive(driver, playerIntent());
  const reconnect = await connect(false);
  await receive(reconnect, {
    type: 'hello',
    episodeId: 'episode-n',
    lastSeenBeat: 1,
  });
  expect(reconnect.messages[0]).toMatchObject({
    type: 'world_snapshot',
    beat: 3,
  });
  expect(reconnect.messages.slice(1)).toEqual(
    driver.messages.filter(
      (message) => message.type === 'beat_result' && message.beat > 1,
    ),
  );
  const current = await connect(false);
  await receive(current, {
    type: 'hello',
    episodeId: 'episode-n',
    lastSeenBeat: 3,
  });
  expect(current.messages).toHaveLength(1);
});

it('allows one driver, broadcasts to observers, and promotes the oldest observer', async () => {
  const { connect, receive, app } = await memoryHarness();
  const driver = await connect();
  const observer = await connect();
  await receive(observer, playerIntent());
  expect(observer.messages.at(-1)).toMatchObject({ code: 'NOT_DRIVER' });
  await receive(observer, {
    type: 'session_command',
    command: 'save_and_quit',
  });
  expect(observer.messages.at(-1)).toMatchObject({ code: 'NOT_DRIVER' });
  await receive(driver, playerIntent());
  expect(observer.messages.at(-1)).toEqual(driver.messages.at(-1));
  driver.close();
  await receive(observer, playerIntent());
  expect(app.sessionHost.session?.beat).toBe(2);
});

it.each(['trace', 'knowledge', 'graph'] as const)(
  'disables %s debug requests before reading data',
  async (kind) => {
    const { connect, receive } = await memoryHarness();
    const client = await connect(false);
    await receive(client, { type: 'debug_request', kind });
    expect(client.messages).toEqual([
      {
        type: 'error',
        code: 'DEBUG_DISABLED',
        message: 'Developer views are disabled.',
      },
    ]);
  },
);

it('reads real traces by beat/attempt, knowledge and depth-one graph in dev mode', async () => {
  const { connect, receive } = await memoryHarness({ dev: true });
  const client = await connect();
  await receive(client, playerIntent());
  for (const target of ['1', '1:0', 'beat-1-0']) {
    await receive(client, { type: 'debug_request', kind: 'trace', target });
    expect(client.messages.at(-1)).toMatchObject({
      type: 'debug_response',
      kind: 'trace',
      data: { beat: 1, attempt: 0, outcome: 'committed' },
    });
  }
  await receive(client, {
    type: 'debug_request',
    kind: 'knowledge',
    target: 'char:ilsa',
  });
  expect(client.messages.at(-1)).toMatchObject({
    type: 'debug_response',
    kind: 'knowledge',
    data: { character: { id: 'char:ilsa' } },
  });
  await receive(client, {
    type: 'debug_request',
    kind: 'graph',
    target: 'char:kael,char:ilsa',
  });
  const graph = client.messages.at(-1);
  expect(graph?.type).toBe('debug_response');
  if (graph?.type !== 'debug_response' || graph.kind !== 'graph')
    throw new Error('Missing graph');
  expect(graph.data.nodes.map(({ id }) => id)).toContain('char:kael');
  expect(
    graph.data.edges.every(
      ({ from, to }) =>
        ['char:kael', 'char:ilsa'].includes(from) ||
        ['char:kael', 'char:ilsa'].includes(to),
    ),
  ).toBe(true);
  await receive(client, {
    type: 'debug_request',
    kind: 'trace',
    target: '../secret',
  });
  expect(client.messages.at(-1)).toMatchObject({ code: 'BAD_TARGET' });
});

it('streams paused/resumed, supports retry_now and logs aborted and committed attempts', async () => {
  const provider = new ScriptedProvider({
    peer: [pass, pass, pass, pass],
    dm: [
      {
        type: 'error',
        error: new LlmUnavailableError('dm', 'test', 'offline'),
      },
      calls(narrate),
    ],
    critic: [accepted],
  });
  const { connect, receive, logs } = await memoryHarness({ provider });
  const client = await connect();
  await receive(client, playerIntent());
  expect(client.messages.at(-1)).toMatchObject({
    type: 'paused',
    reason: 'llm_unavailable',
    retryInMs: 5000,
  });
  await receive(client, { type: 'session_command', command: 'retry_now' });
  expect(client.messages.some(({ type }) => type === 'resumed')).toBe(true);
  expect(client.messages.at(-1)).toMatchObject({
    type: 'beat_result',
    beat: 1,
  });
  expect(logs.filter((line) => line.includes('Beat finished'))).toHaveLength(2);
  expect(logs.join('')).toContain('"outcome":"aborted"');
  expect(logs.join('')).toContain('"outcome":"committed"');
});

it('starts paused at zero budget and accepts raise_budget and save_and_quit', async () => {
  const { connect, receive, app } = await memoryHarness({
    config: configSchema.parse({ budget: { sessionUsd: 0 } }),
  });
  const client = await connect();
  expect(client.messages.at(-1)).toMatchObject({
    type: 'paused',
    reason: 'budget',
  });
  await receive(client, { type: 'session_command', command: 'raise_budget' });
  expect(client.messages.at(-1)).toMatchObject({ type: 'resumed' });
  await receive(client, { type: 'session_command', command: 'save_and_quit' });
  expect(app.sessionHost.session?.state.status).toBe('ended');
});

it('never logs keys, authorization headers, message bodies or provider error details', async () => {
  const fake = 'fake-secret-api-key-123';
  const prompt = 'FULL PRIVATE PROMPT';
  const provider = new ScriptedProvider({
    peer: [pass, pass],
    dm: [{ type: 'error', error: new Error(`${fake} ${prompt}`) }],
  });
  const { app, connect, receive, logs } = await memoryHarness({ provider });
  await app.inject({
    url: `/missing?key=${fake}`,
    headers: { authorization: `Bearer ${fake}`, 'x-api-key': fake },
  });
  const client = await connect();
  await receive(client, JSON.stringify({ type: 'unknown', [fake]: prompt }));
  await receive(client, { ...playerIntent(), text: `${fake} ${prompt}` });
  expect(logs.join('')).not.toContain(fake);
  expect(logs.join('')).not.toContain(prompt);
  expect(
    logs.some(
      (line) =>
        line.includes('Beat finished') &&
        line.includes('"latency":') &&
        line.includes('"cost":'),
    ),
  ).toBe(true);
});

it('pings every 15 seconds, accepts pong, terminates silence and cancels on close', async () => {
  const { clock } = await memoryHarness();
  const socket = new MemorySocket();
  let missed = 0;
  heartbeat(socket, clock, () => {
    missed++;
  });
  await clock.advance(14_999);
  expect(socket.pings).toBe(0);
  await clock.advance(1);
  expect(socket.pings).toBe(1);
  socket.pong();
  await clock.advance(15_000);
  expect(socket.pings).toBe(2);
  await clock.advance(15_000);
  expect(socket.readyState).toBe(3);
  expect(missed).toBe(1);
  expect(clock.tasks.size).toBe(0);
});

it('does not echo a guessed hidden selection id', async () => {
  const { connect, receive } = await memoryHarness();
  const client = await connect();
  await receive(client, {
    ...playerIntent(),
    selection: ['container:old-barrel'],
  });
  expect(client.messages.at(-1)).toMatchObject({ code: 'INVALID_SELECTION' });
  expect(client.raw.join('')).not.toContain('container:old-barrel');
  expect(content.seed.episodeId).toBe('episode-n');
});
