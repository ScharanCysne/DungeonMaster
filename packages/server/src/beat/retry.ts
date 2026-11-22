import type { PauseReason } from '@dungeon/shared';
import type { Clock } from './Clock.js';

export class RetrySchedule {
  #started: number | undefined;
  #step = 0;
  #cancel: (() => void) | undefined;
  constructor(
    private readonly clock: Clock,
    private readonly capMs: number,
  ) {}
  cancel(): void {
    this.#cancel?.();
    this.#cancel = undefined;
  }
  reset(): void {
    this.cancel();
    this.#started = undefined;
    this.#step = 0;
  }
  schedule(reason: PauseReason, retry: () => Promise<void>): number | null {
    this.cancel();
    if (reason !== 'llm_unavailable' && reason !== 'graph_unavailable')
      return null;
    this.#started ??= this.clock.now();
    const delay = [5000, 10000, 20000, 40000][this.#step++] ?? 60000;
    const at = this.clock.now() + delay;
    if (at - this.#started > this.capMs) return null;
    this.#cancel = this.clock.schedule(delay, retry);
    return at;
  }
}
