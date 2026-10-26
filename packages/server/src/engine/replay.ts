import type { GameEvent } from '@dungeon/shared';
import { requireValue } from './errors.js';
import { attachItem, detachItem, registerEntity } from './replayEntities.js';
import { roomOf } from './spatial.js';
import { createState } from './state.js';
import type { EngineState, WalkabilityGrid } from './state.js';

export function reduceEvent(
  previous: EngineState | undefined,
  record: GameEvent,
  grid: WalkabilityGrid,
): EngineState {
  if (record.type === 'SeedLoaded')
    return createState(record.payload.seed, grid, record.payload.rngSeed);
  const state = structuredClone(
    requireValue(previous, 'SeedLoaded before replay'),
  );
  state.beat = record.beat;
  switch (record.type) {
    case 'EntityMoved': {
      const { entityId, to, tile } = record.payload;
      const positioned = [
        ...state.characters.values(),
        ...state.containers.values(),
      ].find((entity) => entity.id === entityId);
      if (positioned) {
        positioned.locationId = to;
        positioned.tile = tile;
      } else {
        const item = [...state.items.values()].find(
          (entity) => entity.id === entityId,
        );
        attachItem(state, requireValue(item, entityId).id, {
          kind: 'location',
          id: to,
        });
      }
      if (state.combat?.order[state.combat.turn] === entityId)
        state.combat.moved = true;
      break;
    }
    case 'ItemTransferred':
      attachItem(state, record.payload.itemId, record.payload.to);
      for (const change of record.payload.goldChanges)
        requireValue(
          state.characters.get(change.characterId),
          change.characterId,
        ).gold = change.gold;
      break;
    case 'ItemEquipped':
      requireValue(
        state.characters.get(record.payload.characterId),
        record.payload.characterId,
      ).equipped[record.payload.slot] = record.payload.itemId;
      break;
    case 'ItemUnequipped':
      delete requireValue(
        state.characters.get(record.payload.characterId),
        record.payload.characterId,
      ).equipped[record.payload.slot];
      break;
    case 'ContainerOpened':
    case 'ContainerUnlocked': {
      const container = requireValue(
        state.containers.get(record.payload.containerId),
        record.payload.containerId,
      );
      if (record.type === 'ContainerOpened') container.opened = true;
      else container.locked = false;
      for (const id of record.payload.revealed)
        requireValue(state.items.get(id), id).hidden = false;
      break;
    }
    case 'EntityRevealed':
    case 'EntityHidden': {
      const entity = [
        ...state.characters.values(),
        ...state.items.values(),
        ...state.containers.values(),
      ].find((entity) => entity.id === record.payload.entityId);
      requireValue(entity, record.payload.entityId).hidden =
        record.type === 'EntityHidden';
      break;
    }
    case 'DamageApplied':
    case 'Healed': {
      const target = requireValue(
        state.characters.get(record.payload.target),
        record.payload.target,
      );
      target.hp = record.payload.hp;
      target.conscious = record.payload.conscious;
      if (
        record.type === 'Healed' &&
        typeof record.payload.source === 'string' &&
        record.payload.source !== 'rest'
      ) {
        detachItem(state, record.payload.source);
        state.items.delete(record.payload.source);
      }
      break;
    }
    case 'CombatStarted': {
      const actorId = requireValue(
        record.actor ?? undefined,
        'CombatStarted actor',
      );
      const actor = requireValue(state.characters.get(actorId), actorId);
      state.combat = {
        order: record.payload.order,
        turn: record.payload.turn,
        round: record.payload.round,
        roomId: roomOf(state, actor.locationId),
        moved: false,
      };
      break;
    }
    case 'TurnAdvanced': {
      const combat = requireValue(
        state.combat ?? undefined,
        'TurnAdvanced combat',
      );
      combat.turn = record.payload.turn;
      combat.round = record.payload.round;
      combat.moved = false;
      break;
    }
    case 'CombatEnded':
      state.combat = null;
      break;
    case 'EntityCreated':
      registerEntity(state, record.payload);
      break;
    default:
      break;
  }
  return structuredClone(state);
}
