import type { FastifyBaseLogger } from 'fastify';
import { resolve } from 'node:path';
import { ReplayArchive } from '../replay/ReplayArchive.js';
import { ReplayConnections } from '../replay/ReplayConnections.js';
import { SessionDelivery } from './delivery.js';
import { sendLifecycle } from './lifecycle.js';
import type { ServerSocket } from './socket.js';
import type { ClientMessage, Hello } from '@dungeon/shared';
import { Session } from '../beat/Session.js';
import type { SessionOptions } from '../beat/bootstrap.js';
import type { EpisodeContent } from '../beat/types.js';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { PlayerHistory } from './history.js';
import { debugResponse } from './debug.js';
import { connect } from './connection.js';
import { RequestError, send } from './wire.js';

export interface HostOptions extends Omit<SessionOptions, 'onMessage'> {
  content: EpisodeContent;
  store: OntologyStore;
  dev: boolean;
  replayId?: string;
  sessionFactory?: (options: SessionOptions) => Promise<Session>;
  onSessionStarted?: (session: Session) => Promise<void>;
}

export class SessionHost {
  readonly attached = new Set<ServerSocket>();
  history: PlayerHistory;
  replay: ReplayConnections | undefined;
  #transitioning = false;
  session: Session | undefined;
  #starting: Promise<Session> | undefined;
  readonly delivery = new SessionDelivery(this);
  #operations = new Set<Promise<void>>();
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

  flush() {
    return this.delivery.flush();
  }
  fail(error: Error) {
    this.delivery.fail(error);
  }

  private start() {
    this.#starting ??= (this.options.sessionFactory ?? Session.start)({
      ...this.options,
      onMessage: this.delivery.observe,
    }).then(async (session) => {
      this.session = session;
      await this.history.sync(session.records);
      await this.options.onSessionStarted?.(session);
      return session;
    });
    return this.#starting;
  }

  async hello(socket: ServerSocket, message: Hello) {
    if (message.episodeId !== this.options.content.seed.episodeId)
      throw new RequestError('UNKNOWN_EPISODE', 'This server hosts episode-n.');
    if (this.replay) {
      await this.replay.hello(socket, message);
      this.attached.add(socket);
      return;
    }
    if (this.#transitioning)
      throw new RequestError('SESSION_CHANGING', 'The session is changing.');
    const session = await this.start();
    await this.delivery.enqueue(async () => {
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
      this.delivery.sentBeat.set(socket, snapshot.beat);
      await sendLifecycle(socket, session, this.history, this.options.dev);
      if (
        session.busy &&
        this.delivery.started &&
        this.delivery.started.beat > snapshot.beat
      )
        send(socket, {
          type: 'beat_started',
          beat: this.delivery.started.beat,
        });
    });
  }

  async dispatch(socket: ServerSocket, message: Exclude<ClientMessage, Hello>) {
    if (message.type === 'debug_request' && !this.options.dev)
      throw new RequestError('DEBUG_DISABLED', 'Developer views are disabled.');
    if (this.replay) return this.replay.dispatch(socket, message);
    if (this.#transitioning)
      throw new RequestError('SESSION_CHANGING', 'The session is changing.');
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
    if (message.type === 'replay_seek')
      throw new RequestError('NOT_REPLAY', 'This is a live session.');
    if (
      message.type === 'session_command' &&
      (message.command === 'replay_session' ||
        message.command === 'start_new_run')
    ) {
      await this.changeSession(message.command);
      return;
    }
    if (message.type === 'player_intent') {
      if (!session.busy) this.delivery.focus = message.selection[0];
      await session.submitIntent(message);
    } else await session.command(message);
    await this.flush();
  }

  async initializeReplay(id: string) {
    this.replay = new ReplayConnections(
      await ReplayArchive.open({
        sessionId: id,
        dataDir: this.options.dataDir ?? resolve('data'),
        grid: this.options.content.grid,
        dev: this.options.dev,
        store: this.options.store,
      }),
    );
  }

  private async changeSession(command: 'replay_session' | 'start_new_run') {
    if (!this.options.dev)
      throw new RequestError('DEBUG_DISABLED', 'Developer views are disabled.');
    if (!this.session || this.session.state.status !== 'ended')
      throw new RequestError(
        'EPISODE_RUNNING',
        'Finish or save this session first.',
      );
    this.#transitioning = true;
    try {
      await this.session.drain();
      await this.flush();
      if (command === 'replay_session') {
        await this.initializeReplay(this.session.id);
        for (const socket of this.attached)
          await this.replay?.hello(socket, {
            type: 'hello',
            episodeId: this.options.content.seed.episodeId,
          });
      } else {
        const options = { ...this.options };
        delete options.sessionId;
        let active = false;
        const session = await Session.start({
          ...options,
          onMessage: (message) => {
            if (active) this.delivery.observe(message);
          },
        });
        this.session = session;
        await this.options.onSessionStarted?.(session);
        this.#starting = Promise.resolve(session);
        this.history = new PlayerHistory(
          this.history.player,
          this.history.mapId,
          this.options.dev,
          this.options.content.grid,
        );
        await this.history.sync(session.records);
        active = true;
        const snapshot = await this.history.snapshot();
        this.delivery.focus = undefined;
        this.delivery.started = undefined;
        for (const socket of this.attached) {
          send(socket, { type: 'session_reset', sessionId: session.id });
          send(socket, snapshot);
          this.delivery.sentBeat.set(socket, 0);
          await sendLifecycle(socket, session, this.history, this.options.dev);
        }
      }
    } finally {
      this.#transitioning = false;
    }
  }

  connect(socket: ServerSocket) {
    connect(this, socket);
  }
  detach(socket: ServerSocket) {
    this.replay?.detach(socket);
    this.attached.delete(socket);
    this.delivery.sentBeat.delete(socket);
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
    await this.delivery.settled();
  }
  async idle() {
    await Promise.all(this.#operations);
    await this.flush();
  }
}
