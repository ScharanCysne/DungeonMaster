import { playerIntentSchema, sessionCommandSchema } from '@dungeon/shared';
import type {
  PauseReason,
  PeerRotationState,
  PlayerIntent,
  ServerMessage,
  SessionCommand,
} from '@dungeon/shared';
import { sessionProgress } from './sessionProgress.js';
import { readExistingEventLog } from '../ontology/eventLog.js';
import { knowledgeSlice } from '../ontology/queries/knowledge.js';
import { sessionView } from './view.js';
import { readTrace } from './readTrace.js';
import { BeatRunner } from './BeatRunner.js';
import { bootstrap } from './bootstrap.js';
import type { Bootstrap, SessionOptions } from './bootstrap.js';
import { pauseReason, SessionError } from './errors.js';
import { pauseDiagnostics, pausedMessage } from './pausedMessage.js';
import { RetrySchedule } from './retry.js';
import { saveBudget, writeSummary } from './sessionStorage.js';
import type { RunResult, SessionState } from './types.js';

export class Session {
  #state: SessionState = { status: 'running' };
  #busy = false;
  #pending: PlayerIntent | undefined;
  #projectionPending = false;
  #rotation: PeerRotationState;
  #recap: string | undefined;
  #attempt = 0;
  #beat: number;
  #cost: number;
  #budget: number;
  readonly #runner: BeatRunner;
  readonly #retry: RetrySchedule;
  private constructor(
    private readonly data: Bootstrap,
    private readonly options: SessionOptions,
  ) {
    const progress = sessionProgress(data);
    this.#beat = progress.beat;
    this.#cost = data.totals.costUsd;
    this.#budget = data.budget;
    this.#attempt = progress.attempt;
    this.#rotation = progress.rotation;
    this.#recap = progress.recap;
    this.#state = progress.state;
    this.#retry = new RetrySchedule(
      data.clock,
      data.config.timeouts.pauseAutoRetryMs,
    );
    this.#runner = new BeatRunner({
      ...data,
      provider: options.provider,
      onProgress: (message) => this.emit(message),
      onCost: (cost) => {
        this.#cost += cost;
        if (
          !this.#busy &&
          this.#state.status !== 'ended' &&
          this.#cost >= this.#budget
        )
          this.pause('budget');
      },
    });
    if (this.#state.status !== 'ended' && this.#cost >= this.#budget)
      this.pause('budget');
  }
  static async start(options: SessionOptions) {
    return new Session(await bootstrap(options), options);
  }
  static async resume(id: string, options: SessionOptions) {
    return new Session(await bootstrap(options, id), options);
  }
  get id() {
    return this.data.sessionId;
  }
  get state(): SessionState {
    return structuredClone(this.#state);
  }
  get busy() {
    return this.#busy;
  }
  get beat() {
    return this.#beat;
  }
  get costUsd() {
    return this.#cost;
  }
  get budgetUsd() {
    return this.#budget;
  }
  get pauseMessage() {
    return pausedMessage(this.#state, this.data);
  }
  get rotation() {
    return structuredClone(this.#rotation);
  }
  get recap() {
    return this.#recap;
  }
  get engine() {
    return this.data.engine;
  }
  get records() {
    return structuredClone(this.data.records);
  }
  drain() {
    return this.#runner.calls.drain();
  }
  look() {
    return sessionView(this.data);
  }
  knowledge() {
    return knowledgeSlice(this.data.store, this.data.player);
  }
  trace(beat: number, attempt?: number) {
    return readTrace(
      this.data.dataDir,
      this.id,
      this.data.player,
      beat,
      attempt,
    );
  }
  private emit(message: ServerMessage): void {
    this.options.onMessage?.(message);
  }

  async submitIntent(raw: PlayerIntent): Promise<RunResult | undefined> {
    if (this.#busy)
      throw new SessionError('BEAT_IN_PROGRESS', 'A beat is already running.');
    if (this.#state.status === 'ended')
      throw new SessionError('EPISODE_ENDED', 'This session has ended.');
    if (this.#state.status === 'paused')
      throw new SessionError('SESSION_PAUSED', this.#state.reason);
    this.#pending = playerIntentSchema.parse(raw);
    if (this.#cost >= this.#budget) {
      this.pause('budget');
      return;
    }
    return this.runPending();
  }

  private async runPending(): Promise<RunResult | undefined> {
    if (!this.#pending) return;
    this.#busy = true;
    let result: RunResult | undefined;
    try {
      this.emit({ type: 'beat_started', beat: this.#beat + 1 });
      const lastNarration = this.data.records.findLast(
        (record) => record.type === 'NarrationCommitted',
      );
      result = await this.#runner.run({
        beat: this.#beat + 1,
        attempt: this.#attempt,
        intent: this.#pending,
        rotation: this.#rotation,
        records: this.data.records,
        ...(this.#recap ? { recap: this.#recap } : {}),
        ...(lastNarration ? { lastNarration: lastNarration.payload } : {}),
      });
      this.data.records.push(...result.records);
      this.#beat++;
      this.#attempt = 0;
      this.#pending = undefined;
      this.#rotation = result.rotation;
      this.#recap = result.recap;
      this.#retry.reset();
      this.emit(result.result);
      if (result.ended) {
        this.#state = { status: 'ended' };
        this.emit(result.ended);
        await this.writeSummary();
      } else if (result.pause) {
        this.#projectionPending = result.pause.projection ?? false;
        this.pause(
          result.pause.reason,
          result.pause.error,
          result.result.traceId,
        );
      } else if (this.#cost >= this.#budget) this.pause('budget');
      else this.#state = { status: 'running' };
      return result;
    } catch (error) {
      if (error instanceof SessionError && error.code === 'INVALID_SELECTION') {
        this.#pending = undefined;
        throw error;
      }
      if (this.#state.status === 'ended') {
        this.emit({
          type: 'error',
          code: 'SUMMARY_WRITE_FAILED',
          message:
            'The episode is committed, but its summary could not be written. Use /quit to try saving again.',
        });
      } else this.pause(pauseReason(error), error);
      return result;
    } finally {
      this.#busy = false;
    }
  }

  private pause(reason: PauseReason, error?: unknown, traceId?: string): void {
    const pause = { reason, beat: this.#beat + 1, attempt: this.#attempt };
    const retryAt = this.#retry.schedule(reason, async () => {
      await this.retry(false);
    });
    this.#state = {
      status: 'paused',
      ...pause,
      retryAt,
      ...pauseDiagnostics(this.#state, pause, error, traceId),
    };
    const message = this.pauseMessage;
    if (message) this.emit(message);
  }

  private async retry(manual: boolean): Promise<RunResult | undefined> {
    if (this.#busy || this.#state.status !== 'paused') return;
    const reason = this.#state.reason;
    if (this.#cost >= this.#budget) {
      this.pause('budget');
      return;
    }
    if (manual) this.#retry.reset();
    this.#retry.cancel();
    this.#busy = true;
    try {
      if (
        !manual &&
        !(await (this.options.healthCheck?.(reason) ??
          this.#runner.healthCheck(reason)))
      ) {
        this.pause(this.#cost >= this.#budget ? 'budget' : reason);
        return;
      }
      if (this.#cost >= this.#budget) {
        this.pause('budget');
        return;
      }
      if (this.#projectionPending) {
        const read = await readExistingEventLog(this.data.dataDir, this.id);
        await this.#runner.projection.catchUp(read.records);
        this.#projectionPending = false;
      } else if (reason === 'graph_unavailable') await this.data.store.nodes();
      await this.data.log.recover();
      this.#state = { status: 'running' };
      this.emit({ type: 'resumed', beat: this.#beat + 1 });
      if (this.#pending) this.#attempt++;
      else this.#retry.reset();
    } catch (error) {
      this.pause(pauseReason(error), error);
      return;
    } finally {
      this.#busy = false;
    }
    return this.runPending();
  }

  async command(raw: SessionCommand): Promise<RunResult | undefined> {
    const { command } = sessionCommandSchema.parse(raw);
    if (command === 'replay_session' || command === 'start_new_run')
      throw new SessionError(
        'HOST_COMMAND',
        'This command requires the session host.',
      );
    if (this.#busy)
      throw new SessionError('BEAT_IN_PROGRESS', 'A beat is already running.');
    if (command === 'save_and_quit') {
      this.#retry.reset();
      this.#state = { status: 'ended' };
      await this.drain();
      await this.writeSummary();
      this.emit({
        type: 'session_saved',
        sessionId: this.id,
        beat: this.#beat,
      });
      return;
    }
    if (this.#state.status === 'ended')
      throw new SessionError('EPISODE_ENDED', 'This session has ended.');
    if (command === 'raise_budget') {
      this.#budget += this.data.config.budget.stepUsd;
      await saveBudget(this.data.dataDir, this.id, this.#budget);
    }
    return this.retry(true);
  }

  private writeSummary(): Promise<void> {
    return writeSummary(
      this.data.dataDir,
      this.id,
      this.data.records,
      this.#budget,
    );
  }
}
