import type { CharacterId, PeerTurn, PlayerIntent } from '@dungeon/shared';

export interface PeerRotationState {
  nextPeer: CharacterId | null;
  consecutivePasses: Partial<Record<CharacterId, number>>;
  pending: CharacterId[];
}
export function initialRotation(): PeerRotationState {
  return { nextPeer: null, consecutivePasses: {}, pending: [] };
}

function named(text: string, name: string): boolean {
  const words: string[] =
    text.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) ?? [];
  return name
    .toLocaleLowerCase('en')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !['the', 'sister'].includes(word))
    .some((word) => words.includes(word));
}

export function rotatePeers(
  peers: readonly { id: CharacterId; name: string }[],
  player: Pick<PlayerIntent, 'selection' | 'text'>,
  state: PeerRotationState,
): { selected: CharacterId[]; state: PeerRotationState } {
  const roster = [...peers].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const start = Math.max(
    0,
    roster.findIndex(({ id }) => id === state.nextPeer),
  );
  const ring = [...roster.slice(start), ...roster.slice(0, start)];
  const addressed = roster.filter(
    ({ id, name }) => player.selection.includes(id) || named(player.text, name),
  );
  const pending = roster.filter(({ id }) => state.pending.includes(id));
  const selected = [
    ...new Set([...addressed, ...pending, ...ring].map(({ id }) => id)),
  ].slice(0, 2);
  const priority = new Set([...addressed, ...pending].map(({ id }) => id));
  const lastRegular = selected.filter((id) => !priority.has(id)).at(-1);
  const nextPeer = lastRegular
    ? (roster[
        (roster.findIndex(({ id }) => id === lastRegular) + 1) % roster.length
      ]?.id ?? null)
    : state.nextPeer;
  return { selected, state: { ...structuredClone(state), nextPeer } };
}

export function recordPeerTurns(
  state: PeerRotationState,
  turns: readonly { actor: CharacterId; turn: PeerTurn }[],
  unresolved: readonly CharacterId[],
): PeerRotationState {
  const next = structuredClone(state);
  for (const { actor, turn } of turns)
    next.consecutivePasses[actor] =
      turn.kind === 'pass' ? (next.consecutivePasses[actor] ?? 0) + 1 : 0;
  next.pending = [...new Set(unresolved)].sort();
  return next;
}
