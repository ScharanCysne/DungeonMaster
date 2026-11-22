import type {
  CharacterId,
  EntityId,
  LocationId,
  Tile,
  TileBounds,
} from '@dungeon/shared';
import { EngineError, requireRule, requireValue } from './errors.js';
import type { EngineCharacter, EngineState } from './state.js';

export function inside(tile: Tile, bounds: TileBounds): boolean {
  return (
    tile.x >= bounds.x &&
    tile.y >= bounds.y &&
    tile.x < bounds.x + bounds.w &&
    tile.y < bounds.y + bounds.h
  );
}

export function roomOf(state: EngineState, id: LocationId): LocationId {
  let location = requireValue(state.locations.get(id), id);
  const visited = new Set<LocationId>();
  while (
    location.kind !== 'room' &&
    location.partOf &&
    !visited.has(location.id)
  ) {
    visited.add(location.id);
    location = requireValue(
      state.locations.get(location.partOf),
      location.partOf,
    );
  }
  if (location.kind === 'spot') {
    return (
      [...state.locations.values()]
        .filter(
          (candidate) =>
            candidate.kind === 'room' &&
            inside(location.tileBounds, candidate.tileBounds),
        )
        .sort(
          (a, b) =>
            a.tileBounds.w * a.tileBounds.h - b.tileBounds.w * b.tileBounds.h,
        )[0]?.id ?? location.id
    );
  }
  return location.id;
}

export function sameRoom(
  state: EngineState,
  actor: EngineCharacter,
  location: LocationId,
): void {
  requireRule(
    roomOf(state, actor.locationId) === roomOf(state, location),
    'NOT_IN_SAME_ROOM',
    `${location}: expected the room containing ${actor.id} (${actor.locationId}).`,
  );
}

export function consciousCharacter(
  state: EngineState,
  id: CharacterId,
): EngineCharacter {
  const character = requireValue(state.characters.get(id), id);
  requireRule(
    character.conscious,
    'ACTOR_UNCONSCIOUS',
    `${id}: expected a conscious character.`,
  );
  return character;
}

export function entityPosition(
  state: EngineState,
  id: EntityId,
): { locationId: LocationId; tile: Tile } {
  for (const character of state.characters.values())
    if (character.id === id) return character;
  for (const container of state.containers.values())
    if (container.id === id) return container;
  for (const item of state.items.values())
    if (item.id === id) return entityPosition(state, item.holder.id);
  for (const location of state.locations.values())
    if (location.id === id) {
      const tiles = tilesIn(location.tileBounds).filter(
        (tile) => state.grid.walkable[tile.y]?.[tile.x],
      );
      const tile = tiles[0];
      if (tile) return { locationId: location.id, tile };
      throw new EngineError(
        'PATH_BLOCKED',
        `${id}: expected a walkable tile inside its bounds.`,
      );
    }
  throw new EngineError(
    'NO_SUCH_ENTITY',
    `${id}: expected a positioned character, container, item or location.`,
  );
}

export function tilesIn(bounds: TileBounds): Tile[] {
  return Array.from({ length: bounds.h }, (_, y) =>
    Array.from({ length: bounds.w }, (_, x) => ({
      x: bounds.x + x,
      y: bounds.y + y,
    })),
  ).flat();
}

export function locationAt(state: EngineState, tile: Tile): LocationId {
  const rank = { spot: 0, room: 1, building: 2 };
  const location = [...state.locations.values()]
    .filter((candidate) => inside(tile, candidate.tileBounds))
    .sort(
      (a, b) =>
        rank[a.kind] - rank[b.kind] ||
        a.tileBounds.w * a.tileBounds.h - b.tileBounds.w * b.tileBounds.h ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )[0];
  if (!location)
    throw new EngineError(
      'PATH_BLOCKED',
      `${tile.x},${tile.y}: expected a destination inside a known location.`,
    );
  return location.id;
}
