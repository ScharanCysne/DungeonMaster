import type { FastifyBaseLogger } from 'fastify';
import type { ServerSocket } from './socket.js';
import type {
  ClientMessage,
  EntityId,
  Hello,
  ServerMessage,
} from '@dungeon/shared';
import { Session } from '../beat/Session.js';
import type { SessionOptions } from '../beat/bootstrap.js';
import { systemClock } from '../beat/Clock.js';
import type { EpisodeContent } from '../beat/types.js';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { PlayerHistory } from './history.js';
import { debugResponse } from './debug.js';
import { connect } from './connection.js';
import { RequestError, send, serializeServerMessage } from './wire.js';

export interface HostOptions extends Omit<SessionOptions, 'onMessage'> {
  content: EpisodeContent;
  store: OntologyStore;
  dev: boolean;
  sessionFactory?: (options: SessionOptions) => Promise<Session>;
}

export class SessionHost {
  readonly attached = new Set<ServerSocket>();
  readonly history: PlayerHistory;
  session: Session | undefined;
  #starting: Promise<Session> | undefined;
  #tail = Promise.resolve();
  #failure: Error | undefined;
  #sentBeat = new Map<ServerSocket, number>();
  #operations = new Set<Promise<void>>();
  #started: { beat: number; time: number; cost: number } | undefined;
  #focus: EntityId | undefined;
  constructor(
    readonly options: HostOptions,
    readonly logger: FastifyBaseLogger,
  ) {
    const player = options.content.seed.characters.find(
      ({ role }) => role === 'player',
    );
    if (!player) throw new Error('Missing player.');
    this.history = new PlayerHistory(
      player.id,
      options.content.seed.mapId,
      options.dev,
      options.content.grid,
    );
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const operation = this.#tail.then(task);
    this.#tail = operation.catch((error: unknown) => {
      if (error instanceof RequestError) return;
      this.#failure ??=
        error instanceof Error ? error : new Error('Delivery failed');
      this.logger.error({ code: 'SERVER_FAILURE' }, 'Server delivery failed');
      for (const socket of this.attached)
        socket.close(1011, 'Server delivery failed');
    });
    return operation;
  }

  async flush() {
    await this.#tail;
    if (this.#failure) throw this.#failure;
  }

  fail(error: Error) {
    this.#failure ??= error;
    this.logger.error(
      { code: 'INVALID_SERVER_MESSAGE' },
      'Server validation failed',
    );
  }

  private observe = (message: ServerMessage) => {
    try {
      serializeServerMessage(message);
    } catch (error) {
      this.#failure ??=
        error instanceof Error ? error : new Error('Invalid server message');
      throw error;
    }
    if (!this.session) return;
    const records = this.session?.records;
    const focus = this.#focus;
    void this.enqueue(async () => {
      if (message.type === 'beat_started')
        this.#started = {
          beat: message.beat,
          time: (this.options.clock ?? systemClock).now(),
          cost: this.session?.costUsd ?? 0,
        };
      if (records && message.type === 'beat_result')
        await this.history.sync(records);
      if (message.type === 'beat_result' || message.type === 'paused')
        await this.logBeat(
          message.type === 'beat_result' ? 'committed' : 'aborted',
        );
      if (message.type === 'paused')
        this.logger.warn(
          { reason: message.reason, beat: message.beat },
          'Session paused',
        );
      const filtered =
        message.type === 'beat_result'
          ? this.history.results.find(({ beat }) => beat === message.beat)
          : this.session
            ? (await this.history.perspective()).message(message)
            : undefined;
      if (filtered)
        for (const socket of this.attached) {
          if (filtered.type === 'beat_result') {
            if (filtered.beat <= (this.#sentBeat.get(socket) ?? -1)) continue;
            this.#sentBeat.set(socket, filtered.beat);
          }
          send(socket, filtered);
        }
      if (message.type === 'beat_started' && focus) {
        const cue = (await this.history.perspective()).message({
          type: 'beat_progress',
          beat: message.beat,
          progress: {
            kind: 'map_cue',
            entity: this.history.player,
            cue: 'look_at',
            target: focus,
          },
        });
        if (cue) for (const socket of this.attached) send(socket, cue);
      }
    }).catch(() => {});
  };

  private async logBeat(outcome: 'committed' | 'aborted') {
    const started = this.#started;
    if (!started || !this.session) return;
    this.#started = undefined;
    const trace = await this.session.trace(started.beat).catch(() => undefined);
    this.logger.info(
      {
        beat: started.beat,
        outcome: trace?.outcome ?? outcome,
        latency:
          trace?.latencyMs ??
          (this.options.clock ?? systemClock).now() - started.time,
        cost: trace?.costUsd ?? this.session.costUsd - started.cost,
      },
      'Beat finished',
    );
  }

  private start() {
    this.#starting ??= (this.options.sessionFactory ?? Session.start)({
      ...this.options,
      onMessage: this.observe,
    }).then(async (session) => {
      this.session = session;
      await this.history.sync(session.records);
      return session;
    });
    return this.#starting;
  }

  async hello(socket: ServerSocket, message: Hello) {
    if (message.episodeId !== this.options.content.seed.episodeId)
      throw new RequestError('UNKNOWN_EPISODE', 'This server hosts episode-n.');
    const session = await this.start();
    await this.enqueue(async () => {
      if (socket.readyState !== socket.OPEN) return;
      if (
        message.lastSeenBeat !== undefined &&
        message.lastSeenBeat > session.beat
      )
        throw new RequestError(
          'BAD_MESSAGE',
          'lastSeenBeat is ahead of this session.',
        );
      const snapshot = await this.history.snapshot();
      send(socket, snapshot);
      if (message.lastSeenBeat !== undefined)
        for (const result of this.history.results)
          if (result.beat > message.lastSeenBeat) send(socket, result);
      this.attached.add(socket);
      this.#sentBeat.set(socket, snapshot.beat);
      const state = session.state;
      if (state.status === 'paused')
        send(socket, {
          type: 'paused',
          reason: state.reason,
          beat: state.beat,
          attempt: state.attempt,
          retryInMs:
            state.retryAt === null
              ? null
              : Math.max(
                  0,
                  state.retryAt - (this.options.clock ?? systemClock).now(),
                ),
        });
      else if (
        session.busy &&
        this.#started &&
        this.#started.beat > snapshot.beat
      )
        send(socket, { type: 'beat_started', beat: this.#started.beat });
      if (state.status === 'ended') {
        const ended = session.records.findLast(
          (event) => event.type === 'EpisodeEnded',
        );
        if (ended) {
          const message = (await this.history.perspective()).message({
            type: 'episode_ended',
            beat: ended.beat,
            holder: ended.payload.holder,
            summary: ended.payload.summary,
          });
          if (message) send(socket, message);
        }
      }
    });
  }

  async dispatch(socket: ServerSocket, message: Exclude<ClientMessage, Hello>) {
    if (message.type === 'debug_request' && !this.options.dev)
      throw new RequestError('DEBUG_DISABLED', 'Developer views are disabled.');
    const session = this.session;
    if (!session || !this.attached.has(socket))
      throw new RequestError(
        'HELLO_REQUIRED',
        'Send hello before using the session.',
      );
    if (message.type === 'debug_request') {
      send(
        socket,
        await debugResponse(
          message,
          session,
          this.options.store,
          this.history.player,
        ),
      );
      return;
    }
    if (this.attached.values().next().value !== socket)
      throw new RequestError(
        'NOT_DRIVER',
        'This connection observes the session; the driver controls it.',
      );
    if (message.type === 'player_intent') {
      if (!session.busy) this.#focus = message.selection[0];
      await session.submitIntent(message);
    } else await session.command(message);
    await this.flush();
  }

  connect(socket: ServerSocket) {
    connect(this, socket);
  }
  detach(socket: ServerSocket) {
    this.attached.delete(socket);
    this.#sentBeat.delete(socket);
  }
  track(operation: Promise<void>) {
    this.#operations.add(operation);
    void operation.finally(() => this.#operations.delete(operation));
  }

  async close() {
    await Promise.all(this.#operations);
    if (this.session) {
      await this.session.drain();
      if (this.session.state.status !== 'ended')
        await this.session.command({
          type: 'session_command',
          command: 'save_and_quit',
        });
    }
    await this.#tail;
  }
  async idle() {
    await Promise.all(this.#operations);
    await this.flush();
  }
}
