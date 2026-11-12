import type { ClientMessage, Hello } from '@dungeon/shared';
import type { ServerSocket } from '../server/socket.js';
import { debugResponse } from '../server/debug.js';
import { RequestError, send } from '../server/wire.js';
import type { ReplayArchive, ReplayCursor } from './ReplayArchive.js';

export class ReplayConnections {
  readonly #cursors = new Map<ServerSocket, ReplayCursor>();
  #tail = Promise.resolve();
  constructor(readonly archive: ReplayArchive) {}

  private enqueue(task: () => Promise<void>) {
    const next = this.#tail.then(task);
    this.#tail = next.catch(() => {});
    return next;
  }
  hello(socket: ServerSocket, message: Hello) {
    return this.enqueue(async () => {
      const cursor =
        this.#cursors.get(socket) ??
        (await this.archive.seek(
          Math.min(message.lastSeenBeat ?? 0, this.archive.beats),
        ));
      this.#cursors.set(socket, cursor);
      send(socket, this.archive.info);
      send(socket, cursor.state);
    });
  }
  dispatch(socket: ServerSocket, message: Exclude<ClientMessage, Hello>) {
    return this.enqueue(async () => {
      const cursor = this.#cursors.get(socket);
      if (!cursor)
        throw new RequestError(
          'HELLO_REQUIRED',
          'Send hello before using the replay.',
        );
      if (message.type === 'replay_seek') {
        const next = await this.archive.seek(message.beat);
        this.#cursors.set(socket, next);
        send(socket, next.state);
      } else if (message.type === 'debug_request') {
        if (!this.archive.dev)
          throw new RequestError(
            'DEBUG_DISABLED',
            'Developer views are disabled.',
          );
        send(
          socket,
          await debugResponse(
            message,
            cursor,
            cursor.history.store,
            cursor.history.player,
          ),
        );
      } else
        throw new RequestError(
          'READ_ONLY',
          'Replay is read only. Intents and session commands are unavailable.',
        );
    });
  }
  detach(socket: ServerSocket) {
    this.#cursors.delete(socket);
  }
}
