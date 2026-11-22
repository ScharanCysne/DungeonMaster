import type { EntityId, ServerMessage } from '@dungeon/shared';
import { systemClock } from '../beat/Clock.js';
import { publicPause } from './lifecycle.js';
import type { SessionHost } from './SessionHost.js';
import type { ServerSocket } from './socket.js';
import { RequestError, send, serializeServerMessage } from './wire.js';

export class SessionDelivery {
  #tail = Promise.resolve();
  #failure: Error | undefined;
  readonly sentBeat = new Map<ServerSocket, number>();
  started: { beat: number; time: number; cost: number } | undefined;
  focus: EntityId | undefined;
  constructor(private readonly host: SessionHost) {}

  enqueue(task: () => Promise<void>): Promise<void> {
    const operation = this.#tail.then(task);
    this.#tail = operation.catch((error: unknown) => {
      if (error instanceof RequestError) return;
      this.#failure ??=
        error instanceof Error ? error : new Error('Delivery failed');
      this.host.logger.error(
        { code: 'SERVER_FAILURE' },
        'Server delivery failed',
      );
      for (const socket of this.host.attached)
        socket.close(1011, 'Server delivery failed');
    });
    return operation;
  }

  async flush() {
    await this.#tail;
    if (this.#failure) throw this.#failure;
  }
  settled() {
    return this.#tail;
  }

  fail(error: Error) {
    this.#failure ??= error;
    this.host.logger.error(
      { code: 'INVALID_SERVER_MESSAGE' },
      'Server validation failed',
    );
  }

  observe = (message: ServerMessage) => {
    try {
      serializeServerMessage(message);
    } catch (error) {
      this.#failure ??=
        error instanceof Error ? error : new Error('Invalid server message');
      throw error;
    }
    if (!this.host.session) return;
    const records = this.host.session?.records;
    const focus = this.focus;
    void this.enqueue(async () => {
      if (message.type === 'beat_started')
        this.started = {
          beat: message.beat,
          time: (this.host.options.clock ?? systemClock).now(),
          cost: this.host.session?.costUsd ?? 0,
        };
      if (records && message.type === 'beat_result')
        await this.host.history.sync(records);
      if (message.type === 'beat_result' || message.type === 'paused')
        await this.logBeat(
          message.type === 'beat_result' ? 'committed' : 'aborted',
        );
      if (message.type === 'paused')
        this.host.logger.warn(
          { reason: message.reason, beat: message.beat },
          'Session paused',
        );
      const filtered =
        message.type === 'paused'
          ? publicPause(message, this.host.options.dev)
          : message.type === 'beat_result'
            ? this.host.history.results.find(
                ({ beat }) => beat === message.beat,
              )
            : this.host.session
              ? (await this.host.history.perspective()).message(message)
              : undefined;
      if (filtered)
        for (const socket of this.host.attached) {
          if (filtered.type === 'beat_result') {
            if (filtered.beat <= (this.sentBeat.get(socket) ?? -1)) continue;
            this.sentBeat.set(socket, filtered.beat);
          }
          send(socket, filtered);
        }
      if (message.type === 'beat_started' && focus) {
        const cue = (await this.host.history.perspective()).message({
          type: 'beat_progress',
          beat: message.beat,
          progress: {
            kind: 'map_cue',
            entity: this.host.history.player,
            cue: 'look_at',
            target: focus,
          },
        });
        if (cue) for (const socket of this.host.attached) send(socket, cue);
      }
    }).catch(() => {});
  };

  private async logBeat(outcome: 'committed' | 'aborted') {
    const started = this.started;
    if (!started || !this.host.session) return;
    this.started = undefined;
    const trace = await this.host.session
      .trace(started.beat)
      .catch(() => undefined);
    this.host.logger.info(
      {
        beat: started.beat,
        outcome: trace?.outcome ?? outcome,
        latency:
          trace?.latencyMs ??
          (this.host.options.clock ?? systemClock).now() - started.time,
        cost: trace?.costUsd ?? this.host.session.costUsd - started.cost,
      },
      'Beat finished',
    );
  }
}
