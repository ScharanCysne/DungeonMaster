import type { EpisodeEnded, Paused } from '@dungeon/shared';
import type { Session } from '../beat/Session.js';
import type { PlayerHistory } from './history.js';
import type { ServerSocket } from './socket.js';
import { send } from './wire.js';

export function publicPause(message: Paused, dev: boolean): Paused {
  if (dev) return message;
  return {
    type: 'paused',
    reason: message.reason,
    beat: message.beat,
    attempt: message.attempt,
    retryInMs: message.retryInMs,
    ...(message.budgetStepUsd === undefined
      ? {}
      : { budgetStepUsd: message.budgetStepUsd }),
  };
}

export async function sendLifecycle(
  socket: ServerSocket,
  session: Session,
  history: PlayerHistory,
  dev: boolean,
) {
  const paused = session.pauseMessage;
  if (paused) send(socket, publicPause(paused, dev));
  if (session.state.status !== 'ended') return;
  const ended = session.records.findLast(
    (event) => event.type === 'EpisodeEnded',
  );
  if (ended) {
    const value: EpisodeEnded = {
      type: 'episode_ended',
      beat: ended.beat,
      holder: ended.payload.holder,
      summary: ended.payload.summary,
    };
    const message = (await history.perspective()).message(value);
    if (message) send(socket, message);
  } else
    send(socket, {
      type: 'session_saved',
      sessionId: session.id,
      beat: session.beat,
    });
}
