import { formatRollStamp } from '@dungeon/shared';
import type { NameLookup, ServerMessage } from '@dungeon/shared';
import type { Session } from '../beat/Session.js';

export function displayMessage(
  message: ServerMessage,
  write: (text: string) => void,
  lookup: NameLookup = () => undefined,
): void {
  switch (message.type) {
    case 'beat_started':
      write(`\nBeat ${message.beat}: The Dungeon Master's quill scratches…`);
      break;
    case 'beat_progress':
      if (message.progress.kind === 'peer_line')
        write(
          `(provisional) ${message.progress.speaker}: ${message.progress.text}`,
        );
      break;
    case 'beat_result':
      for (const event of message.events)
        if (event.type === 'CheckRolled' || event.type === 'AttackResolved')
          write(formatRollStamp(event.payload, lookup));
      write(message.narration.text);
      for (const line of message.narration.lines)
        write(`${line.speaker}: ${line.text}`);
      break;
    case 'episode_ended':
      write(`\nChapter ended. ${message.summary}`);
      break;
    case 'paused':
      write(
        `Paused: ${message.reason.replaceAll('_', ' ')}. ${message.retryInMs === null ? 'Waiting for you.' : `Retry in ${Math.ceil(message.retryInMs / 1000)}s.`} Use /retry, /quit or /budget +5. Provisional lines from an aborted attempt are withdrawn.`,
      );
      break;
    case 'resumed':
      write(`Resuming beat ${message.beat}…`);
      break;
    case 'error':
      write(`${message.code}: ${message.message}`);
      break;
    default:
      break;
  }
}
export function costMeter(session: Session): string {
  return `Cost $${session.costUsd.toFixed(4)} / $${session.budgetUsd.toFixed(2)}`;
}
export function displayLook(
  view: Awaited<ReturnType<Session['look']>>,
  write: (text: string) => void,
): void {
  write(`\n${view.location?.name ?? 'The tavern'}`);
  write(view.situation ?? view.location?.summary ?? '');
  write(
    `Visible: ${view.visible.map(({ id, name }) => `${name} (@${id})`).join(', ') || 'none'}`,
  );
}
