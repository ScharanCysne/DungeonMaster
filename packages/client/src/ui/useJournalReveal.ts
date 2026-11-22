import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ClientState } from '../store/types';

function motionQuery() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)');
}
function subscribeMotion(listener: () => void) {
  const query = motionQuery();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

export function useJournalReveal(
  reveal: ClientState['journal']['reveal'],
  durationMs: number,
) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => motionQuery()?.matches ?? false,
  );
  const beat = reveal?.beat ?? null;
  const [clock, setClock] = useState({ beat, elapsed: 0, skipped: false });
  const elapsed = clock.beat === beat ? clock.elapsed : 0;
  const instant =
    reduced ||
    reveal?.status !== 'revealing' ||
    (clock.beat === beat && clock.skipped);
  useEffect(() => {
    if (instant) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setClock({ beat, elapsed, skipped: elapsed >= durationMs });
    }, 25);
    return () => window.clearInterval(timer);
  }, [beat, instant, durationMs]);
  useEffect(() => {
    if (instant) return;
    const skip = () => setClock({ beat, elapsed: 0, skipped: true });
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [beat, instant]);
  return {
    elapsed,
    instant,
    skip: () => setClock({ beat, elapsed, skipped: true }),
  };
}
