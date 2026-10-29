import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { Writable } from 'node:stream';
import type { SessionOptions } from '../beat/bootstrap.js';
import { systemClock } from '../beat/Clock.js';
import { loadEpisode } from '../content/index.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { heartbeat } from './heartbeat.js';
import { SessionHost } from './SessionHost.js';
import type { ServerSocket } from './socket.js';
import type { HostOptions } from './SessionHost.js';

declare module 'fastify' {
  interface FastifyInstance {
    sessionHost: SessionHost;
  }
}

export interface ServerOptions extends Omit<SessionOptions, 'onMessage'> {
  dev?: boolean;
  logStream?: Writable;
  sessionFactory?: NonNullable<HostOptions['sessionFactory']>;
}

export async function createServer(options: ServerOptions) {
  const app = Fastify({
    logger: {
      level: 'info',
      ...(options.logStream ? { stream: options.logStream } : {}),
      redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
      // URLs, headers, bodies and arbitrary error messages can contain secrets.
      serializers: {
        req: () => ({}),
        err: () => ({ type: 'Error', message: 'Request failed', stack: '' }),
      },
    },
  });
  const host = new SessionHost(
    {
      ...options,
      content: options.content ?? (await loadEpisode()),
      store: options.store ?? new MemoryStore(),
      dev: options.dev === true,
    },
    app.log,
  );
  const stops = new Set<() => void>();
  const sockets = new Set<ServerSocket>();
  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
    errorHandler(_error, socket: ServerSocket) {
      app.log.error({ code: 'WEBSOCKET_ERROR' }, 'WebSocket handler failed');
      socket.terminate();
    },
    preClose(done) {
      for (const stop of stops) stop();
      for (const socket of sockets) socket.terminate();
      done();
    },
  });
  app.get('/healthz', () => ({ status: 'ok' }));
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'Not found' }),
  );
  app.get('/ws', { websocket: true }, (socket: ServerSocket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    host.connect(socket);
    const stop = heartbeat(socket, options.clock ?? systemClock, () => {
      app.log.warn({ code: 'HEARTBEAT_TIMEOUT' }, 'WebSocket missed pong');
    });
    stops.add(stop);
    socket.once('close', () => stops.delete(stop));
  });
  app.addHook('onClose', () => host.close());
  return app.decorate('sessionHost', host);
}
