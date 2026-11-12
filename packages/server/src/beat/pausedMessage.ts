import type { Paused } from '@dungeon/shared';
import { pauseCode } from './errors.js';
import type { Bootstrap } from './bootstrap.js';
import type { SessionState } from './types.js';

export function pauseDiagnostics(
  state: SessionState,
  pause: Pick<Paused, 'reason' | 'beat' | 'attempt'>,
  error?: unknown,
  traceId?: string,
) {
  const previous =
    state.status === 'paused' && state.reason === pause.reason
      ? state
      : undefined;
  return {
    errorCode:
      error === undefined
        ? (previous?.errorCode ?? pauseCode(error, pause.reason))
        : pauseCode(error, pause.reason),
    traceId:
      traceId ?? previous?.traceId ?? `beat-${pause.beat}-${pause.attempt}`,
  };
}

export function pausedMessage(
  state: SessionState,
  data: Pick<Bootstrap, 'config' | 'clock'>,
): Paused | undefined {
  if (state.status !== 'paused') return;
  return {
    type: 'paused',
    reason: state.reason,
    beat: state.beat,
    attempt: state.attempt,
    retryInMs:
      state.retryAt === null
        ? null
        : Math.max(0, state.retryAt - data.clock.now()),
    ...(state.reason === 'budget'
      ? { budgetStepUsd: data.config.budget.stepUsd }
      : {}),
    ...(state.errorCode ? { errorCode: state.errorCode } : {}),
    ...(state.traceId ? { traceId: state.traceId } : {}),
  };
}
