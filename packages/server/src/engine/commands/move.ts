import type { MoveInput, MoveOutput, Tile } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { EngineError, requireRule, requireValue } from '../errors.js';
import {
  consciousCharacter,
  entityPosition,
  inside,
  locationAt,
  roomOf,
  tilesIn,
} from '../spatial.js';
import { adjacentTiles, findPath } from '../rules/pathfinding.js';

export function move(
  ctx: CommandContext,
  input: MoveInput,
): CommandValue<MoveOutput> {
  const { state } = ctx;
  const actor = consciousCharacter(state, input.actor);
  const location = [...state.locations.values()].find(
    (candidate) => candidate.id === input.to,
  );
  const occupied = [...state.characters.values()]
    .filter((character) => character.id !== actor.id)
    .map((character) => character.tile);
  const position = entityPosition(state, input.to);
  const room = requireValue(
    state.locations.get(roomOf(state, position.locationId)),
    position.locationId,
  );
  const inRoom = (tile: Tile) =>
    inside(tile, room.tileBounds) &&
    roomOf(state, locationAt(state, tile)) === room.id;
  requireRule(
    inside(position.tile, room.tileBounds),
    'PATH_BLOCKED',
    `${input.to}: expected a position inside its room.`,
  );
  const targets = location
    ? tilesIn(location.tileBounds).filter(
        (tile) => location.kind !== 'room' || inRoom(tile),
      )
    : adjacentTiles(position.tile).filter(inRoom);
  let path: Tile[];
  try {
    path = findPath(state.grid, actor.tile, targets, occupied);
  } catch (error) {
    if (
      location ||
      !(error instanceof EngineError) ||
      error.code !== 'PATH_BLOCKED'
    )
      throw error;
    path = findPath(
      state.grid,
      actor.tile,
      tilesIn(room.tileBounds).filter(inRoom),
      occupied,
    );
  }
  const tile = requireValue(path.at(-1), input.to);
  const value = {
    entityId: actor.id,
    from: actor.locationId,
    to: locationAt(state, tile),
    tile,
    path,
  };
  actor.tile = tile;
  actor.locationId = value.to;
  ctx.emit({ type: 'EntityMoved', payload: value }, actor.id, actor.locationId);
  return {
    value,
    facts: [
      `${actor.name} moved from ${value.from} to ${value.to} at (${tile.x}, ${tile.y}).`,
    ],
  };
}
