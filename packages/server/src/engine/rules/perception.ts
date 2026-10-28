import type { CharacterId } from '@dungeon/shared';
import type { EventContext, PendingEvent } from '../events.js';
import { roomOf } from '../spatial.js';
import type { EngineState } from '../state.js';

export function witnessCandidates(
  state: EngineState,
  event: EventContext,
): CharacterId[] {
  const room = roomOf(state, event.locationId);
  const lit = state.locations.get(room)?.lit ?? true;
  return [...state.characters.values()]
    .filter((character) => {
      const direct =
        character.id === event.actor || event.targets.includes(character.id);
      return (
        roomOf(state, character.locationId) === room &&
        character.conscious &&
        (!event.private || direct) &&
        (lit || character.tags.includes('darkvision') || direct)
      );
    })
    .map((character) => character.id);
}

export function witnessesFor(
  state: EngineState,
  pending: Pick<PendingEvent, 'context' | 'candidateWitnesses'>,
): CharacterId[] {
  const { actor } = pending.context;
  const beaten = new Set<CharacterId>();
  for (const receipt of state.receipts.values()) {
    if (
      actor === null ||
      receipt.beat !== state.beat ||
      receipt.winner !== actor
    )
      continue;
    const initiated = receipt.actor === actor;
    const skill = initiated ? receipt.skill : receipt.targetSkill;
    const opponent = initiated ? receipt.target : receipt.actor;
    if (opponent && (skill === 'stealth' || skill === 'sleight_of_hand'))
      beaten.add(opponent);
  }
  return pending.candidateWitnesses.filter((id) => !beaten.has(id));
}
