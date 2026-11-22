import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach } from 'vitest';
import { serverMessageSchema } from '@dungeon/shared';
import type { ClientMessage, ServerMessage } from '@dungeon/shared';
import { content, FakeClock, script } from '../../beat/testing/harness.js';
import { createServer } from '../index.js';
import type { ServerOptions } from '../index.js';
import type { ServerSocket } from '../socket.js';

export class MemorySocket implements ServerSocket {
  readonly OPEN = 1;
  readyState = 1;
  readonly messages: ServerMessage[] = [];
  readonly raw: string[] = [];
  pings = 0;
  #message: ((data: Buffer, binary: boolean) => void) | undefined;
  #pong: (() => void) | undefined;
  #close: (() => void)[] = [];
  on(
    event: string,
    listener: ((data: Buffer, binary: boolean) => void) | (() => void),
  ) {
    if (event === 'message') this.#message = listener;
    if (event === 'pong') this.#pong = () => listener(Buffer.alloc(0), false);
  }
  once(_event: 'close', listener: () => void) {
    this.#close.push(listener);
  }
  send(text: string) {
    this.raw.push(text);
    this.messages.push(serverMessageSchema.parse(JSON.parse(text)));
  }
  ping() {
    this.pings++;
  }
  pong() {
    this.#pong?.();
  }
  terminate() {
    this.close();
  }
  close() {
    this.readyState = 3;
    this.#close.forEach((listener) => listener());
  }
  receive(message: ClientMessage | string) {
    this.#message?.(
      Buffer.from(
        typeof message === 'string' ? message : JSON.stringify(message),
      ),
      false,
    );
  }
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
export async function memoryHarness(options: Partial<ServerOptions> = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dungeon-host-'));
  const clock = new FakeClock();
  const logs: string[] = [];
  const app = await createServer({
    provider: script(3),
    content,
    clock,
    dataDir,
    sessionId: 'memory-session',
    sessionSeed: 'golden',
    logStream: new Writable({
      write(chunk: Buffer, _encoding, done) {
        logs.push(chunk.toString());
        done();
      },
    }),
    ...options,
  });
  cleanup.push(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const connect = async (hello = true) => {
    const socket = new MemorySocket();
    app.sessionHost.connect(socket);
    if (hello) {
      socket.receive({ type: 'hello', episodeId: 'episode-n' });
      await app.sessionHost.idle();
    }
    return socket;
  };
  const receive = async (
    socket: MemorySocket,
    message: ClientMessage | string,
  ) => {
    socket.receive(message);
    await app.sessionHost.idle();
  };
  return { app, clock, logs, connect, receive, dataDir };
}
