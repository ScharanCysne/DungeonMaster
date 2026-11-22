import { initialRotation } from '../agents/peers/index.js';
import type { Bootstrap } from './bootstrap.js';
import type { SessionState } from './types.js';

export function sessionProgress(data: Bootstrap) {
  const beat = data.records.at(-1)?.beat ?? 0;
  let rotation = initialRotation();
  let recap: string | undefined;
  let state: SessionState = { status: 'running' };
  for (const event of data.records) {
    if (event.type === 'BeatCommitted' && event.payload.rotation)
      rotation = event.payload.rotation;
    if (event.type === 'RecapUpdated') recap = event.payload.text;
    if (event.type === 'EpisodeEnded') state = { status: 'ended' };
  }
  const attempt =
    Math.max(
      -1,
      ...data.totals.attempts
        .filter((entry) => entry.beat === beat + 1)
        .map(({ attempt }) => attempt),
    ) + 1;
  return { beat, rotation, recap, state, attempt };
}
