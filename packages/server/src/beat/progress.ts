import type { BeatProgress, BeatProgressPayload } from '@dungeon/shared';
import { notifyProgress } from '../agents/progress.js';

type Phase = Extract<BeatProgressPayload, { kind: 'status' }>['phase'];

export function beatProgress(
  beat: number,
  onProgress: ((message: BeatProgress) => void) | undefined,
) {
  let active = true;
  let toolCalls = 0;
  let dmPhase: 'dm' | 'dm_retry' = 'dm';
  const send = (progress: BeatProgressPayload) => {
    if (active)
      notifyProgress(onProgress, { type: 'beat_progress', beat, progress });
  };
  const status = (phase: Phase) => {
    if (phase === 'dm' || phase === 'dm_retry') dmPhase = phase;
    send({ kind: 'status', phase, ...(toolCalls ? { toolCalls } : {}) });
  };
  return {
    send,
    status,
    toolCall: (count: number) => {
      toolCalls = count;
      status(dmPhase);
    },
    stop() {
      active = false;
    },
  };
}
