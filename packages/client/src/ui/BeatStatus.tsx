import { useEffect, useState } from 'react';
import type { BeatState } from '../store/types';
import { beatStatus } from './composerModel';

export function BeatStatus({
  beat,
  fallback,
}: {
  beat: BeatState;
  fallback: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (beat.status !== 'running' && beat.status !== 'paused') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [beat.status]);
  return (
    <p className="beat-status" role="status" aria-live="polite">
      {beatStatus(beat, now) || fallback}
    </p>
  );
}
