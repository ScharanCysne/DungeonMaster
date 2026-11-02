import { vi } from 'vitest';

export function mockReducedMotion(initial = false) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  return (value: boolean) => {
    matches = value;
    listeners.forEach((listener) => listener());
  };
}
