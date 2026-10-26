import type { MoveInput, MoveOutput } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { requireValue } from '../errors.js';
import {
  consciousCharacter,
  entityPosition,
  locationAt,
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
  const targets = location
    ? tilesIn(location.tileBounds)
    : adjacentTiles(entityPosition(state, input.to).tile);
  const path = findPath(
    state.grid,
    actor.tile,
    targets,
    [...state.characters.values()]
      .filter((character) => character.id !== actor.id)
      .map((character) => character.tile),
  );
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
