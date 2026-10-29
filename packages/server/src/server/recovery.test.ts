import { expect, it, vi } from 'vitest';
import { Session } from '../beat/Session.js';
import { content, deferred, playerIntent } from '../beat/testing/harness.js';
import { entityPosition } from '../engine/spatial.js';
import { memoryHarness } from './testing/memoryHarness.js';

it('delivers a commit made while a reconnect snapshot is being assembled', async () => {
  const { app, connect, receive } = await memoryHarness();
  const driver = await connect();
  const observer = await connect(false);
  const gate = deferred<void>();
  const entered = deferred<void>();
  const snapshot = app.sessionHost.history.snapshot.bind(
    app.sessionHost.history,
  );
  vi.spyOn(app.sessionHost.history, 'snapshot').mockImplementationOnce(
    async () => {
      const value = await snapshot();
      entered.resolve();
      await gate.promise;
      return value;
    },
  );
  observer.receive({ type: 'hello', episodeId: 'episode-n', lastSeenBeat: 0 });
  await entered.promise;
  driver.receive(playerIntent());
  await vi.waitFor(() => expect(app.sessionHost.session?.beat).toBe(1));
  gate.resolve();
  await app.sessionHost.idle();
  expect(observer.messages[0]).toMatchObject({
    type: 'world_snapshot',
    beat: 0,
  });
  expect(
    observer.messages.filter(({ type }) => type === 'beat_result'),
  ).toHaveLength(1);
  await receive(observer, {
    type: 'hello',
    episodeId: 'episode-n',
    lastSeenBeat: 1,
  });
  expect(
    observer.messages.filter(({ type }) => type === 'beat_result'),
  ).toHaveLength(1);
});

it('reconstructs missed results from canonical records supplied by a resumed Session', async () => {
  const first = await memoryHarness();
  const driver = await first.connect();
  await first.receive(driver, playerIntent());
  await first.receive(driver, playerIntent());
  await first.app.close();
  const resumed = await memoryHarness({
    dataDir: first.dataDir,
    sessionFactory: (options) => Session.resume('memory-session', options),
  });
  const client = await resumed.connect(false);
  await resumed.receive(client, {
    type: 'hello',
    episodeId: 'episode-n',
    lastSeenBeat: 0,
  });
  expect(client.messages[0]).toMatchObject({ type: 'world_snapshot', beat: 2 });
  expect(client.messages.slice(1)).toEqual(
    driver.messages.filter(({ type }) => type === 'beat_result'),
  );
});

it('sends a provisional look-at cue only for visible selection', async () => {
  const { connect, receive } = await memoryHarness();
  const client = await connect();
  await receive(client, { ...playerIntent(), selection: ['char:brann'] });
  expect(client.messages).toContainEqual({
    type: 'beat_progress',
    beat: 1,
    progress: {
      kind: 'map_cue',
      entity: 'char:kael',
      cue: 'look_at',
      target: 'char:brann',
    },
  });
  await receive(client, {
    ...playerIntent(),
    selection: ['container:old-barrel'],
  });
  expect(client.raw.join('')).not.toContain('container:old-barrel');
});

it('surfaces invalid Session callbacks to tests without shipping them', async () => {
  const { app, connect } = await memoryHarness({
    async sessionFactory(options) {
      const session = await Session.start(options);
      try {
        options.onMessage?.({ type: 'beat_started', beat: -1 });
      } catch {
        /* Session observers can swallow callback exceptions. */
      }
      return session;
    },
  });
  await expect(connect()).rejects.toThrow();
  await expect(app.sessionHost.flush()).rejects.toThrow();
});

it('positions visible loose items using the same location anchor as the engine', async () => {
  const modified = structuredClone(content);
  const item = modified.seed.items.find(({ id }) => id === 'item:iron-key');
  if (!item) throw new Error('Missing key');
  item.holder = { kind: 'location', id: 'loc:common-room' };
  item.hidden = false;
  const { app, connect } = await memoryHarness({ content: modified });
  const client = await connect();
  const snapshot = client.messages[0];
  const session = app.sessionHost.session;
  if (snapshot?.type !== 'world_snapshot' || !session)
    throw new Error('Missing snapshot');
  expect(
    snapshot.positions.find(({ entityId }) => entityId === item.id),
  ).toEqual({
    entityId: item.id,
    ...entityPosition(session.engine.state, item.id),
  });
});
