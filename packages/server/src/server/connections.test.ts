import { createConnection } from 'node:net';
import { expect, it, vi } from 'vitest';
import { playerIntent, script } from '../beat/testing/harness.js';
import { serverHarness } from './testing/harness.js';
import { requireLoopback } from './testing/loopback.js';
import {
  forbiddenSeedStrings,
  winningScript,
} from './testing/winningScript.js';

requireLoopback();

it.each([false, true])(
  'finishes a full scripted episode over real sockets (dev %s)',
  async (dev) => {
    const winning = winningScript();
    const { connect, app } = await serverHarness({ ...winning, dev });
    const client = await connect();
    for (let beat = 1; beat <= 3; beat++) {
      client.send(playerIntent());
      expect(await client.next('beat_result')).toMatchObject({ beat });
    }
    expect(await client.next('episode_ended')).toMatchObject({
      holder: 'char:ilsa',
      beat: 3,
    });
    await app.sessionHost.idle();
    const results = client.messages.filter(
      (message) => message.type === 'beat_result',
    );
    if (dev)
      expect(results.every((result) => result.groundTruth !== undefined)).toBe(
        true,
      );
    else
      for (const forbidden of forbiddenSeedStrings())
        expect(client.raw.join('\n')).not.toContain(
          JSON.stringify(forbidden).slice(1, -1),
        );
    winning.provider.assertDrained();
  },
);

it('resends exactly missed beat results after a WebSocket drop', async () => {
  const { connect } = await serverHarness({ provider: script(3) });
  const driver = await connect();
  const observer = await connect();
  driver.send(playerIntent());
  await driver.next('beat_result');
  await observer.next('beat_result');
  await observer.close();
  for (let beat = 2; beat <= 3; beat++) {
    driver.send(playerIntent());
    await driver.next('beat_result');
  }
  const reconnected = await connect(false);
  reconnected.send({ type: 'hello', episodeId: 'episode-n', lastSeenBeat: 1 });
  expect(await reconnected.next('world_snapshot')).toMatchObject({ beat: 3 });
  expect(await reconnected.next('beat_result')).toEqual(
    driver.messages.find(
      (message) => message.type === 'beat_result' && message.beat === 2,
    ),
  );
  expect(await reconnected.next('beat_result')).toEqual(
    driver.messages.find(
      (message) => message.type === 'beat_result' && message.beat === 3,
    ),
  );
  // A response after replay acts as a socket-order barrier without timing sleeps.
  reconnected.send({ type: 'debug_request', kind: 'graph' });
  await reconnected.next('error');
  expect(
    reconnected.messages.filter(({ type }) => type === 'beat_result'),
  ).toHaveLength(2);
});

it('broadcasts to a second client but only accepts the driver until disconnect', async () => {
  const { connect, app } = await serverHarness({ provider: script(2) });
  const first = await connect();
  const second = await connect();
  second.send(playerIntent());
  expect(await second.next('error')).toMatchObject({ code: 'NOT_DRIVER' });
  first.send(playerIntent());
  expect(await second.next('beat_result')).toEqual(
    await first.next('beat_result'),
  );
  await first.close();
  await vi.waitFor(() => expect(app.sessionHost.attached.size).toBe(1));
  second.send(playerIntent());
  expect(await second.next('beat_result')).toMatchObject({ beat: 2 });
});

it.each([false, true])(
  'gates real-socket debug requests (dev %s)',
  async (dev) => {
    const { connect } = await serverHarness({ dev });
    const client = await connect();
    client.send(playerIntent());
    await client.next('beat_result');
    for (const kind of ['trace', 'knowledge', 'graph'] as const) {
      client.send({ type: 'debug_request', kind });
      if (dev)
        expect(await client.next('debug_response')).toMatchObject({ kind });
      else
        expect(await client.next('error')).toMatchObject({
          code: 'DEBUG_DISABLED',
        });
    }
  },
);

it('keeps native clients alive when they answer heartbeat pings', async () => {
  const { connect, clock, app } = await serverHarness();
  const client = await connect();
  const transport = app.sessionHost.attached.values().next().value;
  if (!transport) throw new Error('Missing attached socket');
  let pongs = 0;
  transport.on('pong', () => {
    pongs++;
  });
  await clock.advance(15_000);
  await vi.waitFor(() => expect(pongs).toBe(1));
  client.send({ type: 'hello', episodeId: 'episode-n' });
  await client.next('world_snapshot');
  await clock.advance(15_000);
  await vi.waitFor(() => expect(pongs).toBe(2));
  client.send({ type: 'hello', episodeId: 'episode-n' });
  await client.next('world_snapshot');
  expect(client.socket.readyState).toBe(WebSocket.OPEN);
});

it('terminates an upgraded silent socket on its missed pong', async () => {
  const { address, clock } = await serverHarness();
  const url = new URL(address);
  // Native WebSocket always answers ping; this raw upgrade models a stalled transport.
  const socket = createConnection({
    host: url.hostname,
    port: Number(url.port),
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    const upgraded = new Promise<void>((resolve) =>
      socket.once('data', () => resolve()),
    );
    socket.write(
      `GET /ws HTTP/1.1\r\nHost: ${url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    );
    await upgraded;
    const closed = new Promise<void>((resolve) =>
      socket.once('close', () => resolve()),
    );
    await clock.advance(15_000);
    expect(socket.destroyed).toBe(false);
    await clock.advance(15_000);
    await closed;
    expect(socket.destroyed).toBe(true);
  } finally {
    socket.destroy();
  }
});
