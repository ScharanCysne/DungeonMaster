import { validateSeedReferences } from '@dungeon/shared';
import type { EpisodeSeed, SpriteManifest } from '@dungeon/shared';
import { Engine } from '../engine/index.js';
import { inside, locationAt, roomOf } from '../engine/spatial.js';
import { objectId, objectsIn, roomBounds, walkabilityGrid } from './tiled.js';
import type { TiledMap } from './tiled.js';

export function checkConsistency(
  seed: EpisodeSeed,
  map: TiledMap,
  sprites: SpriteManifest,
): string[] {
  const problems = validateSeedReferences(seed);
  const grid = walkabilityGrid(map);
  const entities = [...seed.characters, ...seed.containers];
  const physical = [...entities, ...seed.items];
  const rooms = new Map(
    objectsIn(map, 'rooms').map((object) => [
      objectId(object),
      roomBounds(object),
    ]),
  );
  const placements = new Map(
    objectsIn(map, 'entities').map((object) => [
      objectId(object),
      { x: Math.floor(object.x / 16), y: Math.floor(object.y / 16) },
    ]),
  );
  const locations = new Map(
    seed.locations.map((location) => [location.id, location]),
  );

  for (const location of seed.locations) {
    const bounds = location.tileBounds;
    const mapped = rooms.get(location.id);
    if (!mapped) problems.push(`${location.id}: missing from map rooms layer.`);
    else if (
      bounds.x !== mapped.x ||
      bounds.y !== mapped.y ||
      bounds.w !== mapped.w ||
      bounds.h !== mapped.h
    )
      problems.push(
        `${location.id}: tileBounds disagree with map rooms layer.`,
      );
    if (
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.x + bounds.w > map.width ||
      bounds.y + bounds.h > map.height
    )
      problems.push(`${location.id}: tileBounds extend outside the map.`);
    const visited = new Set<string>([location.id]);
    let parent = location.partOf;
    while (parent) {
      if (visited.has(parent)) {
        problems.push(`${location.id}: location parent cycle at ${parent}.`);
        break;
      }
      visited.add(parent);
      parent = locations.get(parent)?.partOf;
    }
  }
  for (const id of rooms.keys())
    if (!seed.locations.some((location) => location.id === id))
      problems.push(`${id}: map room missing from seed.`);

  for (const entity of entities) {
    const { tile } = entity;
    if (!grid.walkable[tile.y]?.[tile.x])
      problems.push(`${entity.id}: non-walkable tile (${tile.x}, ${tile.y}).`);
    const location = locations.get(entity.location);
    if (location && !inside(tile, location.tileBounds))
      problems.push(
        `${entity.id}: tile (${tile.x}, ${tile.y}) outside room ${location.id}.`,
      );
    const mapped = placements.get(entity.id);
    if (!mapped)
      problems.push(`${entity.id}: missing from map entities layer.`);
    else if (mapped.x !== tile.x || mapped.y !== tile.y)
      problems.push(
        `${entity.id}: map position (${mapped.x}, ${mapped.y}) disagrees with seed (${tile.x}, ${tile.y}).`,
      );
  }
  for (const id of placements.keys())
    if (!entities.some((entity) => entity.id === id))
      problems.push(`${id}: map entity missing from seed.`);

  for (const entity of physical) {
    for (const tag of entity.tags)
      if (!Object.hasOwn(sprites.tags, tag))
        problems.push(`${entity.id}: unknown sprite tag "${tag}".`);
    if (!Object.hasOwn(sprites.overrides, entity.id))
      problems.push(`${entity.id}: missing explicit sprite override.`);
  }
  for (const id of Object.keys(sprites.overrides))
    if (!physical.some((entity) => entity.id === id))
      problems.push(`${id}: sprite override missing from seed.`);

  // Resolve overlapping rectangles with the same priority as movement.
  if (problems.length === 0) {
    try {
      const state = new Engine(seed, grid, seed.episodeId).state;
      for (const entity of entities) {
        const actual = roomOf(state, locationAt(state, entity.tile));
        if (actual !== roomOf(state, entity.location))
          problems.push(
            `${entity.id}: tile belongs to room ${actual}, not ${entity.location}.`,
          );
      }
    } catch (error) {
      problems.push(
        error instanceof Error ? error.message : 'Invalid engine seed.',
      );
    }
  }
  return problems;
}

export function contentCounts(seed: EpisodeSeed) {
  return {
    locations: seed.locations.length,
    characters: seed.characters.length,
    items: seed.items.length,
    containers: seed.containers.length,
    facts: seed.facts.length,
    quests: seed.quests.length,
    factions: seed.factions.length,
  };
}
