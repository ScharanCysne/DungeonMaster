import type { EntityId, GameEvent, GameEventOf } from '@dungeon/shared';

export interface MapFeedback {
  beat: number;
  changed: EntityId[];
  moves: GameEventOf<'EntityMoved'>[];
}

function changedIds(event: GameEvent): EntityId[] {
  switch (event.type) {
    case 'EntityMoved':
    case 'EntityRevealed':
    case 'EntityHidden':
      return [event.payload.entityId];
    case 'EntityCreated':
      return [event.payload.entity.id];
    case 'DamageApplied':
    case 'Healed':
      return [event.payload.target];
    case 'ContainerOpened':
    case 'ContainerUnlocked':
      return [event.payload.containerId, ...event.payload.revealed];
    case 'ItemEquipped':
    case 'ItemUnequipped':
      return [event.payload.itemId, event.payload.characterId];
    case 'ItemTransferred':
      return [
        event.payload.itemId,
        event.payload.from.id,
        event.payload.to.id,
        ...event.payload.goldChanges.map(({ characterId }) => characterId),
      ];
    default:
      return [];
  }
}

export function mapFeedback(events: GameEvent[], beat: number): MapFeedback {
  return {
    beat,
    changed: [...new Set(events.flatMap(changedIds))],
    moves: events.filter((event) => event.type === 'EntityMoved'),
  };
}
