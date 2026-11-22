import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach } from 'vitest';
import { serverMessageSchema } from '@dungeon/shared';
import type { ClientMessage, ServerMessage } from '@dungeon/shared';
import { content, FakeClock, script } from '../../beat/testing/harness.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { createServer } from '../index.js';
import type { ServerOptions } from '../index.js';

export class Client {
  readonly messages: ServerMessage[] = [];
  readonly raw: string[] = [];
  readonly socket: WebSocket;
  #queue: ServerMessage[] = [];
  #wake: (() => void) | undefined;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') throw new Error('Expected text');
      this.raw.push(event.data);
      const message = serverMessageSchema.parse(JSON.parse(event.data));
      this.messages.push(message);
      this.#queue.push(message);
      this.#wake?.();
    });
  }
  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }
  async open() {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener(
        'error',
        () => reject(new Error('Socket failed')),
        { once: true },
      );
    });
    return this;
  }
  async next<T extends ServerMessage['type']>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const timeout = setTimeout(() => this.#wake?.(), 3000);
    const deadline = Date.now() + 3000;
    try {
      for (;;) {
        const message = this.#queue.shift();
        if (message?.type === type) {
          // Narrow using the same discriminant checked by the wire validator.
          const match = [message].find(
            (value): value is Extract<ServerMessage, { type: T }> =>
              value.type === type,
          );
          if (match) return match;
        }
        if (Date.now() >= deadline)
          throw new Error(
            `Timed out waiting for ${type}: ${JSON.stringify(this.messages)}`,
          );
        if (!this.#queue.length)
          await new Promise<void>((resolve) => {
            this.#wake = resolve;
          });
      }
    } finally {
      clearTimeout(timeout);
      this.#wake = undefined;
    }
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket.addEventListener('close', () => resolve(), { once: true });
      this.socket.close();
    });
  }
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

export async function serverHarness(options: Partial<ServerOptions> = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dungeon-server-'));
  const logs: string[] = [];
  const clock = new FakeClock();
  const store = new MemoryStore();
  const provider = options.provider ?? script();
  const app = await createServer({
    provider,
    content,
    clock,
    store,
    dataDir,
    sessionId: 'socket-session',
    sessionSeed: 'golden',
    logStream: new Writable({
      write(chunk: Buffer, _encoding, done) {
        logs.push(chunk.toString());
        done();
      },
    }),
    ...options,
  });
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  cleanup.push(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const connect = async (hello = true) => {
    const client = await new Client(
      address.replace('http:', 'ws:') + '/ws',
    ).open();
    if (hello) {
      client.send({ type: 'hello', episodeId: 'episode-n' });
      await client.next('world_snapshot');
    }
    return client;
  };
  return { app, clock, store, provider, dataDir, logs, address, connect };
}
