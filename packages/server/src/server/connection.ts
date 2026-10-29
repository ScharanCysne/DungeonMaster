import type { ServerMessage } from '@dungeon/shared';
import type { ServerSocket } from './socket.js';
import {
  OutboundMessageError,
  parseClientMessage,
  RequestError,
  send,
} from './wire.js';
import { SessionError } from '../beat/errors.js';
import type { SessionHost } from './SessionHost.js';

export function connect(host: SessionHost, socket: ServerSocket) {
  let ready = Promise.resolve();
  socket.once('close', () => host.detach(socket));
  socket.on('error', () =>
    host.logger.warn({ code: 'SOCKET_ERROR' }, 'WebSocket transport failed'),
  );
  socket.on('message', (data, binary) => {
    const operation = (async () => {
      if (binary)
        throw new RequestError('BAD_MESSAGE', 'Expected a JSON text message.');
      const raw = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data);
      const message = parseClientMessage(raw.toString('utf8'));
      if (message.type === 'hello') {
        const attach = ready.then(() => host.hello(socket, message));
        ready = attach.catch(() => {});
        await attach;
      } else {
        await ready;
        await host.dispatch(socket, message);
      }
    })().catch((error: unknown) => {
      if (error instanceof OutboundMessageError) {
        host.fail(error);
        socket.close(1011, 'Invalid server message');
        return;
      }
      if (error instanceof RequestError || error instanceof SessionError) {
        host.logger.warn({ code: error.code }, 'Request rejected');
        const reply: ServerMessage = {
          type: 'error',
          code: error.code,
          message:
            error instanceof SessionError && error.code === 'INVALID_SELECTION'
              ? 'Selection must contain visible entities or inventory items.'
              : error.message,
        };
        send(socket, reply);
      } else {
        host.logger.error({ code: 'INTERNAL_ERROR' }, 'Session request failed');
        send(socket, {
          type: 'error',
          code: 'INTERNAL_ERROR',
          message: 'The session request failed.',
        });
      }
    });
    host.track(operation);
  });
}
