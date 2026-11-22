import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientStore } from '../store';
import { createInitialState } from '../store/types';
import { result, snapshot } from '../testing/fixtures';
import { createConnection, websocketUrl } from './client';

class FakeSocket extends EventTarget {
  static instances: FakeSocket[] = [];
  readyState: WebSocket['readyState'] = 0;
  sent: string[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  message(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}
function latest() {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error('Expected a socket');
  return socket;
}
function setup(lastSeenBeat = 0) {
  const initial = createInitialState();
  initial.connection.lastSeenBeat = lastSeenBeat;
  const store = createClientStore(initial);
  const client = createConnection({
    store,
    WebSocket: FakeSocket,
    url: 'ws://localhost:5173/ws',
    now: () => 123,
  });
  client.start();
  return { store, client };
}
beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('WebSocket client', () => {
  it('connects to the same-origin ws endpoint and sends hello with the store cursor', () => {
    expect(websocketUrl({ protocol: 'https:', host: 'game.test' })).toBe(
      'wss://game.test/ws',
    );
    expect(websocketUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws',
    );
    const { store, client } = setup(7);
    expect(store.getState().connection.status).toBe('connecting');
    latest().open();
    expect(latest().sent).toEqual([
      JSON.stringify({
        type: 'hello',
        episodeId: 'episode-n',
        lastSeenBeat: 7,
      }),
    ]);
    expect(store.getState().connection.status).toBe('open');
    client.stop();
  });
  it.each([
    'not json',
    JSON.stringify({ type: 'beat_started', beat: '1' }),
    JSON.stringify({ type: 'unknown' }),
    new Blob(['hello']),
  ])(
    'puts malformed inbound data into store errors without throwing',
    (data) => {
      const { store, client } = setup();
      latest().open();
      expect(() => latest().message(data)).not.toThrow();
      expect(store.getState().connection.error?.code).toBe(
        'INVALID_SERVER_MESSAGE',
      );
      expect(store.getState().beat.status).toBe('idle');
      client.stop();
    },
  );
  it('passes validated messages through the reducer with injected receipt time', () => {
    const { store, client } = setup();
    latest().open();
    latest().message(JSON.stringify(snapshot));
    latest().message(JSON.stringify({ type: 'beat_started', beat: 1 }));
    expect(store.getState().world.entities['char:player']?.name).toBe('Kael');
    expect(store.getState().beat).toMatchObject({
      status: 'running',
      startedAt: 123,
    });
    client.stop();
  });
  it('backs off from 1s to 30s and resets after the server accepts hello', () => {
    const { store, client } = setup();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const count = FakeSocket.instances.length;
      latest().close();
      expect(store.getState().connection).toMatchObject({
        status: 'closed',
        retries: count,
      });
      vi.advanceTimersByTime(delay - 1);
      expect(FakeSocket.instances).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.instances).toHaveLength(count + 1);
    }
    latest().open();
    latest().message(JSON.stringify(snapshot));
    expect(store.getState().connection.retries).toBe(0);
    const count = FakeSocket.instances.length;
    latest().close();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(count + 1);
    client.stop();
  });
  it('cancels reconnect and ignores messages from stale sockets after stop', () => {
    const { store, client } = setup();
    const old = latest();
    old.close();
    client.stop();
    vi.advanceTimersByTime(30000);
    old.open();
    old.message(JSON.stringify(snapshot));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(store.getState().world.mapId).toBeNull();
    expect(store.getState().connection.status).toBe('closed');
  });
  it('stores socket errors, reconnecting only once even when close follows error', () => {
    const { store, client } = setup();
    latest().dispatchEvent(new Event('error'));
    expect(store.getState().connection.error?.code).toBe('CONNECTION_FAILED');
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    client.stop();
  });
  it('sends valid intent, command and debug messages, rejecting invalid outgoing shapes', () => {
    const { store, client } = setup();
    latest().open();
    const messages = [
      {
        type: 'player_intent',
        text: 'Open the box.',
        selection: ['container:box'],
      },
      { type: 'session_command', command: 'retry_now' },
      { type: 'debug_request', kind: 'graph', target: 'char:player' },
    ];
    for (const message of messages) expect(client.send(message)).toBe(true);
    expect(
      latest()
        .sent.slice(1)
        .map((text): unknown => JSON.parse(text)),
    ).toEqual(messages);
    expect(store.getState().composer.history).toHaveLength(1);
    expect(
      client.send({
        type: 'player_intent',
        text: 'x'.repeat(501),
        selection: [],
      }),
    ).toBe(false);
    expect(client.send({ type: 'session_command', command: 'destroy' })).toBe(
      false,
    );
    expect(latest().sent).toHaveLength(4);
    expect(store.getState().connection.error?.code).toBe(
      'INVALID_CLIENT_MESSAGE',
    );
    client.stop();
  });
  it('keeps unsent text when disconnected', () => {
    const { store, client } = setup();
    store.getState().dispatch({ type: 'composer_text', text: 'Wait.' });
    expect(
      client.send({ type: 'player_intent', text: 'Wait.', selection: [] }),
    ).toBe(false);
    expect(store.getState().composer.text).toBe('Wait.');
    expect(store.getState().composer.history).toEqual([]);
    client.stop();
  });
  it('refreshes after a live result and reconnects with the committed cursor', () => {
    const { store, client } = setup();
    latest().open();
    latest().message(JSON.stringify(snapshot));
    latest().message(JSON.stringify(result()));
    expect(latest().sent.at(-1)).toBe(
      JSON.stringify({
        type: 'hello',
        episodeId: 'episode-n',
        lastSeenBeat: 1,
      }),
    );
    latest().close();
    vi.advanceTimersByTime(1000);
    latest().open();
    expect(latest().sent[0]).toContain('"lastSeenBeat":1');
    expect(store.getState().connection.lastSeenBeat).toBe(1);
    client.stop();
  });
});

it('recovers text after disconnection before the intent is acknowledged', () => {
  const { store, client } = setup();
  latest().open();
  latest().message(JSON.stringify(snapshot));
  client.send({ type: 'player_intent', selection: [], text: 'Wait here.' });
  expect(store.getState().composer.pending?.text).toBe('Wait here.');
  latest().close();
  expect(store.getState().composer).toMatchObject({
    pending: null,
    text: 'Wait here.',
  });
  vi.advanceTimersByTime(1000);
  latest().open();
  latest().message(JSON.stringify(snapshot));
  expect(store.getState().connection.error).toBeNull();
  client.stop();
});
