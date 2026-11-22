import { readFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { playerIntent } from '../beat/testing/harness.js';
import { logPath } from '../ontology/eventLog.js';
import { memoryHarness } from './testing/memoryHarness.js';
import {
  forbiddenSeedStrings,
  winningScript,
} from './testing/winningScript.js';

test.each([false, true])(
  'replay hello/seek/debug are read only and never call a provider (dev %s)',
  async (dev) => {
    const live = await memoryHarness({ ...winningScript(), dev });
    const driver = await live.connect();
    for (let beat = 1; beat <= 3; beat++)
      await live.receive(driver, playerIntent());
    const session = live.app.sessionHost.session;
    if (!session) throw new Error('Missing live session');
    const path = logPath(live.dataDir, session.id);
    const original = await readFile(path, 'utf8');
    const complete = vi.fn(() => {
      throw new Error('LLM called in replay');
    });
    const replay = await memoryHarness({
      replayId: session.id,
      dataDir: live.dataDir,
      provider: { complete },
      dev,
    });
    expect(replay.app.sessionHost.session).toBeUndefined();
    const client = await replay.connect();
    expect(client.messages[0]).toEqual({
      type: 'replay_info',
      sessionId: session.id,
      beats: 3,
      ended: true,
    });
    expect(client.messages.at(-1)).toMatchObject({
      type: 'replay_state',
      snapshot: { beat: 0 },
      results: [],
    });
    await replay.receive(client, { type: 'replay_seek', beat: 3 });
    const end = client.messages.at(-1);
    expect(end).toMatchObject({
      type: 'replay_state',
      snapshot: { beat: 3 },
      ended: { holder: 'char:ilsa' },
    });
    if (end?.type !== 'replay_state') throw new Error('Missing replay state');
    expect(end.results).toEqual(
      driver.messages.filter((message) => message.type === 'beat_result'),
    );
    expect(end.ended).toEqual(
      driver.messages.find((message) => message.type === 'episode_ended'),
    );
    expect(!!end.groundTruth).toBe(dev);
    if (!dev)
      for (const forbidden of forbiddenSeedStrings())
        expect(client.raw.join('')).not.toContain(forbidden);
    const observer = await replay.connect();
    await replay.receive(observer, { type: 'replay_seek', beat: 1 });
    await replay.receive(client, {
      type: 'debug_request',
      kind: 'knowledge',
      target: 'char:ilsa',
    });
    if (dev) {
      const knowledge = client.messages.at(-1);
      if (
        knowledge?.type !== 'debug_response' ||
        knowledge.kind !== 'knowledge'
      )
        throw new Error('Missing knowledge');
      expect(
        knowledge.data.inventory.some(({ id }) => id === 'item:quill'),
      ).toBe(true);
    } else
      expect(client.messages.at(-1)).toMatchObject({ code: 'DEBUG_DISABLED' });
    await replay.receive(observer, {
      type: 'debug_request',
      kind: 'knowledge',
      target: 'char:ilsa',
    });
    if (dev) {
      const knowledge = observer.messages.at(-1);
      if (
        knowledge?.type !== 'debug_response' ||
        knowledge.kind !== 'knowledge'
      )
        throw new Error('Missing knowledge');
      expect(
        knowledge.data.inventory.some(({ id }) => id === 'item:quill'),
      ).toBe(false);
    }
    await replay.receive(observer, {
      type: 'debug_request',
      kind: 'trace',
      target: '3',
    });
    expect(observer.messages.at(-1)).toMatchObject({
      code: dev ? 'TRACE_NOT_FOUND' : 'DEBUG_DISABLED',
    });
    for (const message of [
      playerIntent(),
      ...(
        [
          'retry_now',
          'save_and_quit',
          'raise_budget',
          'start_new_run',
          'replay_session',
        ] as const
      ).map((command) => ({ type: 'session_command' as const, command })),
    ]) {
      await replay.receive(client, message);
      expect(client.messages.at(-1)).toMatchObject({ code: 'READ_ONLY' });
    }
    await replay.receive(client, { type: 'replay_seek', beat: 4 });
    expect(client.messages.at(-1)).toMatchObject({ code: 'BAD_REPLAY_BEAT' });
    await replay.app.close();
    expect(complete).not.toHaveBeenCalled();
    expect(await readFile(path, 'utf8')).toBe(original);
  },
);

test('end-page replay action switches attached viewers to replay without creating a session', async () => {
  const live = await memoryHarness({ ...winningScript(), dev: true });
  const driver = await live.connect();
  const observer = await live.connect();
  for (let beat = 0; beat < 3; beat++)
    await live.receive(driver, playerIntent());
  const id = live.app.sessionHost.session?.id;
  await live.receive(driver, {
    type: 'session_command',
    command: 'replay_session',
  });
  expect(driver.messages.at(-2)).toMatchObject({
    type: 'replay_info',
    sessionId: id,
  });
  expect(observer.messages.at(-1)).toMatchObject({
    type: 'replay_state',
    snapshot: { beat: 0 },
  });
  await live.receive(driver, playerIntent());
  expect(driver.messages.at(-1)).toMatchObject({ code: 'READ_ONLY' });
});

test('new run has a new log and starts from the seed for every attached client', async () => {
  const live = await memoryHarness({ ...winningScript(), dev: true });
  const driver = await live.connect();
  const observer = await live.connect();
  const seed = driver.messages[0];
  const id = live.app.sessionHost.session?.id;
  for (let beat = 0; beat < 3; beat++)
    await live.receive(driver, playerIntent());
  await live.receive(observer, {
    type: 'session_command',
    command: 'start_new_run',
  });
  expect(observer.messages.at(-1)).toMatchObject({ code: 'NOT_DRIVER' });
  await live.receive(driver, {
    type: 'session_command',
    command: 'start_new_run',
  });
  const fresh = live.app.sessionHost.session;
  expect(fresh?.id).not.toBe(id);
  expect(fresh?.beat).toBe(0);
  expect(fresh?.state.status).toBe('running');
  expect(fresh?.engine.state.items.get('item:quill')?.holder).toEqual({
    kind: 'container',
    id: 'container:old-barrel',
  });
  expect(fresh?.records.map(({ type }) => type)).toEqual([
    'SeedLoaded',
    'BeatCommitted',
  ]);
  expect(driver.messages.at(-2)).toMatchObject({
    type: 'session_reset',
    sessionId: fresh?.id,
  });
  expect(driver.messages.at(-1)).toEqual(seed);
  expect(observer.messages.at(-1)).toEqual(seed);
});

test('production refuses end-page developer commands and a live session refuses seeking', async () => {
  const live = await memoryHarness();
  const driver = await live.connect();
  for (const command of ['start_new_run', 'replay_session'] as const) {
    await live.receive(driver, { type: 'session_command', command });
    expect(driver.messages.at(-1)).toMatchObject({ code: 'DEBUG_DISABLED' });
  }
  await live.receive(driver, { type: 'replay_seek', beat: 0 });
  expect(driver.messages.at(-1)).toMatchObject({ code: 'NOT_REPLAY' });
});
