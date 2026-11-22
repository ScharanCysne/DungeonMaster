import type { EntityId, Node } from '@dungeon/shared';
import type { BeatState } from '../store/types';

const EXAMPLE_VERBS = {
  character: 'ask, bribe, distract',
  container: 'search, open, force',
  item: 'use, give, examine',
  place: 'inspect, go to',
};
export function exampleVerbs(
  selection: EntityId[],
  entities: Record<string, Node>,
): string {
  const node = entities[selection[0] ?? ''];
  if (!node) return 'I would like to…';
  const kind =
    'role' in node
      ? 'character'
      : 'opened' in node
        ? 'container'
        : 'rarity' in node
          ? 'item'
          : 'place';
  return `${EXAMPLE_VERBS[kind]}…`;
}
export function shouldRecall(text: string, caret: number | null): boolean {
  return text.length === 0 || caret === 0;
}
export function beatStatus(beat: BeatState, now: number): string {
  if (beat.status === 'paused') {
    const remaining =
      beat.retryAt === undefined
        ? beat.retryInMs
        : beat.retryAt === null
          ? null
          : Math.max(0, beat.retryAt - now);
    return `Paused: ${beat.reason.replaceAll('_', ' ')}. ${remaining === null ? 'Waiting for you.' : `Retry in ${Math.ceil(remaining / 1000)}s.`}`;
  }
  if (beat.status === 'saved') return 'Session saved. You can close the book.';
  if (beat.status === 'ended') return 'The chapter has ended.';
  if (beat.status !== 'running') return '';
  const labels = {
    peers: 'A peer is speaking…',
    dm: 'DM is resolving…',
    npc_voice: 'An NPC is finding their words…',
    critic: 'Checking the narration…',
    dm_retry: 'DM is revising…',
    committing: 'Saving the beat…',
  };
  const label = beat.phase
    ? labels[beat.phase]
    : "The Dungeon Master's quill scratches…";
  const actions =
    beat.toolCalls === null
      ? ''
      : ` ${beat.toolCalls} ${beat.toolCalls === 1 ? 'action' : 'actions'}`;
  return `${label}${actions}${actions ? ' ·' : ''} ${Math.max(0, Math.floor((now - beat.startedAt) / 1000))}s`;
}
