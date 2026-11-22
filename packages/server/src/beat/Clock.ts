export interface Clock {
  now(): number;
  schedule(delayMs: number, task: () => void | Promise<void>): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  schedule(delayMs, task) {
    const timer = setTimeout(() => {
      void task();
    }, delayMs);
    return () => clearTimeout(timer);
  },
};
