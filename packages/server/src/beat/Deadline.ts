import { LlmUnavailableError } from '../agents/llm/errors.js';
import type { LlmProvider, LlmRequest } from '../agents/llm/types.js';
import type { Clock } from './Clock.js';

export class Deadline {
  #stopped = false;
  #cancel: () => void;
  readonly expired: Promise<never>;
  readonly at: number;
  constructor(
    private readonly clock: Clock,
    ms: number,
  ) {
    this.at = clock.now() + ms;
    this.expired = new Promise((_, reject) => {
      this.#cancel = clock.schedule(ms, () => {
        this.#stopped = true;
        reject(this.error());
      });
    });
    this.#cancel ??= () => {};
  }
  private error() {
    return new LlmUnavailableError(
      'dm',
      'beat',
      'Beat wall clock limit exceeded or attempt cancelled.',
    );
  }
  check(): void {
    if (this.#stopped || this.clock.now() >= this.at) throw this.error();
  }
  async wait<T>(work: Promise<T>): Promise<T> {
    const result = await Promise.race([work, this.expired]);
    this.check();
    return result;
  }
  provider(provider: LlmProvider): LlmProvider {
    return {
      complete: async <T>(request: LlmRequest<T>) => {
        this.check();
        const response = await provider.complete(request);
        this.check();
        return response;
      },
    };
  }
  stop(): void {
    this.#stopped = true;
    this.#cancel();
  }
}
