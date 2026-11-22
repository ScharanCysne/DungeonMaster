import type { LlmProvider, LlmRequest } from '../agents/llm/types.js';

export class Calls {
  readonly pending = new Set<Promise<unknown>>();
  wrap(provider: LlmProvider): LlmProvider {
    return {
      complete: <T>(request: LlmRequest<T>) => {
        const call = provider.complete(request);
        this.pending.add(call);
        void call.then(
          () => this.pending.delete(call),
          () => this.pending.delete(call),
        );
        return call;
      },
    };
  }
  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
