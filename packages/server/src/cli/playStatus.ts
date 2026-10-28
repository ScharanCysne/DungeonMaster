import type { BeatProgressPayload, ServerMessage } from '@dungeon/shared';

export type PlayStatus = Extract<BeatProgressPayload, { kind: 'status' }>;

const labels: Record<PlayStatus['phase'], string> = {
  peers: 'A peer is speaking…',
  dm: 'DM is resolving…',
  npc_voice: 'An NPC is finding their words…',
  critic: 'Checking the narration…',
  dm_retry: 'DM is revising…',
  committing: 'Saving the beat…',
};

export function statusText(
  status: PlayStatus,
  elapsedSeconds?: number,
): string {
  const actions =
    status.toolCalls === undefined
      ? ''
      : ` ${status.toolCalls} ${status.toolCalls === 1 ? 'action' : 'actions'}`;
  const elapsed =
    elapsedSeconds === undefined
      ? ''
      : `${actions ? ' ·' : ''} ${Math.max(0, Math.floor(elapsedSeconds))}s`;
  return `${labels[status.phase]}${actions}${elapsed}`;
}

export function createStatusRenderer<Timer>(options: {
  write: (text: string) => void;
  now: () => number;
  isTTY: boolean;
  setInterval: (tick: () => void, ms: number) => Timer;
  clearInterval: (timer: Timer) => void;
}) {
  let startedAt: number | undefined;
  let status: PlayStatus | undefined;
  let timer: Timer | undefined;
  let drawn = false;
  const clear = () => {
    if (drawn) options.write('\r\u001b[2K');
    drawn = false;
  };
  const draw = () => {
    if (!options.isTTY || !status || startedAt === undefined) return;
    options.write(
      `\r\u001b[2K${statusText(status, (options.now() - startedAt) / 1000)}`,
    );
    drawn = true;
  };
  const stop = () => {
    if (timer !== undefined) options.clearInterval(timer);
    timer = undefined;
    startedAt = undefined;
    status = undefined;
    clear();
  };
  const start = () => {
    stop();
    startedAt = options.now();
    if (options.isTTY) timer = options.setInterval(draw, 1000);
  };
  return {
    stop,
    write: (text: string) => {
      clear();
      options.write(`${text}\n`);
      draw();
    },
    message(message: ServerMessage) {
      if (message.type === 'beat_started') start();
      if (
        message.type === 'beat_progress' &&
        message.progress.kind === 'status'
      ) {
        if (startedAt === undefined) return;
        const changed = status?.phase !== message.progress.phase;
        status = message.progress;
        if (options.isTTY) draw();
        else if (changed)
          options.write(
            `${statusText({ kind: 'status', phase: status.phase })}\n`,
          );
      }
      if (
        ['beat_result', 'paused', 'error', 'episode_ended'].includes(
          message.type,
        )
      )
        stop();
    },
  };
}
