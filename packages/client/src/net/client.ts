import { clientMessageSchema, serverMessageSchema } from '@dungeon/shared';
import type { ClientStore } from '../store';
import type { StoreApi } from 'zustand/vanilla';

type Socket = Pick<
  WebSocket,
  'readyState' | 'send' | 'close' | 'addEventListener'
>;
export type SocketConstructor = new (url: string) => Socket;
export interface ConnectionOptions {
  store: StoreApi<ClientStore>;
  WebSocket: SocketConstructor;
  url: string;
  now?: () => number;
}
export function websocketUrl(
  location: Pick<Location, 'protocol' | 'host'>,
): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
}
export function createConnection(options: ConnectionOptions) {
  const { store } = options;
  const now = options.now ?? Date.now;
  let socket: Socket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  let retries = 0;
  const receive = (code: string, message: string) =>
    store.getState().receive({ type: 'error', code, message }, now());
  const connection = (status: ClientStore['connection']['status']) =>
    store.getState().dispatch({ type: 'connection', status, retries });

  function send(value: unknown): boolean {
    const parsed = clientMessageSchema.safeParse(value);
    if (!parsed.success) {
      receive(
        'INVALID_CLIENT_MESSAGE',
        'The message could not be sent: invalid format.',
      );
      return false;
    }
    if (!socket || socket.readyState !== 1 || stopped) {
      receive(
        'CONNECTION_CLOSED',
        'The connection is closed. Your writing has been kept.',
      );
      return false;
    }
    try {
      socket.send(JSON.stringify(parsed.data));
    } catch {
      receive(
        'SEND_FAILED',
        'The message could not be sent. Please try again.',
      );
      return false;
    }
    if (parsed.data.type === 'player_intent')
      store.getState().dispatch({ type: 'intent_sent', intent: parsed.data });
    return true;
  }
  function hello() {
    return send({
      type: 'hello',
      episodeId: 'episode-n',
      lastSeenBeat: store.getState().connection.lastSeenBeat,
    });
  }
  function reconnect() {
    if (stopped || timer !== undefined) return;
    const delay = Math.min(1000 * 2 ** retries, 30_000);
    retries += 1;
    connection('closed');
    timer = setTimeout(() => {
      timer = undefined;
      connect();
    }, delay);
  }
  function connect() {
    if (stopped) return;
    connection('connecting');
    let current: Socket;
    try {
      current = new options.WebSocket(options.url);
    } catch {
      receive('CONNECTION_FAILED', 'Unable to connect to the game server.');
      reconnect();
      return;
    }
    socket = current;
    const active = () => !stopped && socket === current;
    current.addEventListener('open', () => {
      if (!active()) return;
      connection('open');
      hello();
    });
    current.addEventListener('message', (event) => {
      if (!active()) return;
      let value: unknown;
      try {
        const data: unknown =
          event instanceof MessageEvent ? event.data : undefined;
        if (typeof data !== 'string') {
          receive(
            'INVALID_SERVER_MESSAGE',
            'The server sent a message in an invalid format.',
          );
          return;
        }
        value = JSON.parse(data);
      } catch {
        receive('INVALID_SERVER_MESSAGE', 'The server sent invalid JSON.');
        return;
      }
      const parsed = serverMessageSchema.safeParse(value);
      if (!parsed.success) {
        receive(
          'INVALID_SERVER_MESSAGE',
          'The server sent a message in an invalid format.',
        );
        return;
      }
      const message = parsed.data;
      const previousBeat = store.getState().world.beat;
      store.getState().receive(message, now());
      if (message.type === 'world_snapshot') {
        retries = 0;
        connection('open');
      }
      // Reveal events carry IDs, not nodes. Re-hello refreshes visibility without a new protocol.
      if (message.type === 'beat_result' && message.beat > previousBeat)
        hello();
    });
    current.addEventListener('error', () => {
      if (!active()) return;
      receive(
        'CONNECTION_FAILED',
        'The game connection was interrupted. Reconnecting…',
      );
      socket = undefined;
      current.close();
      reconnect();
    });
    current.addEventListener('close', () => {
      if (!active()) return;
      socket = undefined;
      reconnect();
    });
  }
  return {
    send,
    start() {
      if (!stopped) return;
      stopped = false;
      retries = 0;
      connect();
    },
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const current = socket;
      socket = undefined;
      current?.close();
      connection('closed');
    },
  };
}
