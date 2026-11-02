import type { CharacterId, GameEvent } from '@dungeon/shared';
import type { WorldState } from './types';

export function inventoryMetadata(
  world: WorldState,
  events: GameEvent[],
  beat: number,
  player: CharacterId | undefined,
) {
  let acquiredAt = world.acquiredAt;
  let equipped = world.equipped;
  for (const event of events) {
    if (event.type === 'ItemTransferred') {
      const { itemId, from, to } = event.payload;
      if (to.id === player && from.id !== player)
        acquiredAt = { ...acquiredAt, [itemId]: beat };
      if (from.id === player) equipped = equipped.filter((id) => id !== itemId);
    }
    if (
      event.type === 'ItemEquipped' &&
      event.payload.characterId === player &&
      !equipped.includes(event.payload.itemId)
    )
      equipped = [...equipped, event.payload.itemId];
    if (event.type === 'ItemUnequipped' && event.payload.characterId === player)
      equipped = equipped.filter((id) => id !== event.payload.itemId);
    if (event.type === 'EntityHidden') {
      acquiredAt = { ...acquiredAt };
      delete acquiredAt[event.payload.entityId];
      equipped = equipped.filter((id) => id !== event.payload.entityId);
    }
  }
  return { acquiredAt, equipped };
}
