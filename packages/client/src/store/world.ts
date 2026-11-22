import type {
  Character,
  GameEvent,
  Node,
  WorldSnapshot,
} from '@dungeon/shared';
import type { WorldState } from './types';
import { inventoryMetadata } from './inventory';

export function isCharacter(node: Node | undefined): node is Character {
  return node !== undefined && 'role' in node;
}
export function playerId(world: WorldState) {
  return Object.values(world.entities).find(
    (node): node is Character => isCharacter(node) && node.role === 'player',
  )?.id;
}
export function visibleEvents(
  world: WorldState,
  events: GameEvent[],
): GameEvent[] {
  const player = playerId(world);
  return player === undefined
    ? []
    : events.filter(
        (event) =>
          event.witnesses.includes(player) &&
          (!event.private || event.actor === player),
      );
}
export function snapshotWorld(
  message: WorldSnapshot,
  previous?: WorldState,
): WorldState {
  return {
    beat: message.beat,
    mapId: message.mapId,
    entities: Object.fromEntries(
      message.entities.map((node) => [node.id, node]),
    ),
    positions: Object.fromEntries(
      message.positions.map(({ entityId, ...position }) => [
        entityId,
        position,
      ]),
    ),
    party: message.party,
    inventory: message.inventory,
    gold: message.gold,
    acquiredAt: previous?.acquiredAt ?? {},
    equipped: previous?.equipped ?? [],
  };
}
export function applyWorldEvents(
  world: WorldState,
  events: GameEvent[],
  beat: number,
): WorldState {
  const metadata = inventoryMetadata(world, events, beat, playerId(world));
  if (beat <= world.beat)
    return metadata.acquiredAt === world.acquiredAt &&
      metadata.equipped === world.equipped
      ? world
      : { ...world, ...metadata };
  const next = {
    ...world,
    ...metadata,
    beat,
    entities: { ...world.entities },
    positions: { ...world.positions },
  };
  const player = playerId(world);
  for (const event of events) {
    switch (event.type) {
      case 'EntityCreated': {
        const { entity, position } = event.payload;
        next.entities[entity.id] = entity;
        if (position) next.positions[entity.id] = position;
        if (
          isCharacter(entity) &&
          entity.role !== 'npc' &&
          !next.party.includes(entity.id)
        )
          next.party = [...next.party, entity.id];
        break;
      }
      case 'FactCreated':
        next.entities[event.payload.fact.id] = {
          ...event.payload.fact,
          truth: 'unknown',
        };
        break;
      case 'EntityMoved': {
        const { entityId, to, tile } = event.payload;
        if (next.entities[entityId])
          next.positions[entityId] = { locationId: to, tile };
        break;
      }
      case 'EntityHidden': {
        const { entityId } = event.payload;
        delete next.entities[entityId];
        delete next.positions[entityId];
        next.party = next.party.filter((id) => id !== entityId);
        next.inventory = next.inventory.filter((id) => id !== entityId);
        break;
      }
      case 'EntityRevealed': {
        const node = next.entities[event.payload.entityId];
        if (node && 'hidden' in node)
          next.entities[node.id] = { ...node, hidden: false };
        break;
      }
      case 'DamageApplied':
      case 'Healed': {
        const node = next.entities[event.payload.target];
        if (isCharacter(node))
          next.entities[node.id] = {
            ...node,
            hp: event.payload.hp,
            conscious: event.payload.conscious,
          };
        break;
      }
      case 'ItemTransferred': {
        const { itemId, to, goldChanges } = event.payload;
        next.inventory = next.inventory.filter((id) => id !== itemId);
        if (to.kind === 'character' && to.id === player)
          next.inventory = [...next.inventory, itemId];
        delete next.positions[itemId];
        for (const change of goldChanges) {
          if (change.characterId === player) next.gold = change.gold;
          const node = next.entities[change.characterId];
          if (isCharacter(node))
            next.entities[node.id] = { ...node, gold: change.gold };
        }
        break;
      }
      case 'ContainerOpened':
      case 'ContainerUnlocked': {
        const node = next.entities[event.payload.containerId];
        if (node && 'opened' in node)
          next.entities[node.id] =
            event.type === 'ContainerOpened'
              ? { ...node, opened: true }
              : { ...node, locked: false };
        break;
      }
      case 'QuestStatusChanged': {
        const node = next.entities[event.payload.questId];
        if (node && 'objective' in node)
          next.entities[node.id] = { ...node, status: event.payload.status };
        break;
      }
    }
  }
  return next;
}
