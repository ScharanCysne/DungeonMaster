import type { Tile } from '@dungeon/shared';
import { EngineError } from '../errors.js';
import type { WalkabilityGrid } from '../state.js';

export const tileKey = (tile: Tile): string => `${tile.x},${tile.y}`;
export const adjacentTiles = (tile: Tile): Tile[] => [
  { x: tile.x + 1, y: tile.y },
  { x: tile.x, y: tile.y + 1 },
  { x: tile.x - 1, y: tile.y },
  { x: tile.x, y: tile.y - 1 },
];

export function findPath(
  grid: WalkabilityGrid,
  start: Tile,
  targets: Tile[],
  occupied: Tile[],
): Tile[] {
  const occupiedKeys = new Set(occupied.map(tileKey));
  const blocked = new Set(
    (grid.doors ?? [])
      .filter((door) => door.locked)
      .map((door) => tileKey(door.tile)),
  );
  const walkable = (tile: Tile): boolean =>
    tile.x >= 0 &&
    tile.x < grid.width &&
    tile.y >= 0 &&
    tile.y < grid.height &&
    grid.walkable[tile.y]?.[tile.x] === true &&
    !blocked.has(tileKey(tile));
  const goals = targets.filter(
    (tile) => walkable(tile) && !occupiedKeys.has(tileKey(tile)),
  );
  const goalKeys = new Set(goals.map(tileKey));
  const heuristic = (tile: Tile): number =>
    Math.min(
      ...goals.map(
        (goal) => Math.abs(tile.x - goal.x) + Math.abs(tile.y - goal.y),
      ),
    );
  const open = [{ tile: start, cost: 0, score: heuristic(start) }];
  const costs = new Map([[tileKey(start), 0]]);
  const parents = new Map<string, Tile>();
  while (goals.length > 0 && open.length > 0) {
    open.sort((a, b) => a.score - b.score || a.cost - b.cost);
    const current = open.shift();
    if (!current) break;
    if (current.cost !== costs.get(tileKey(current.tile))) continue;
    if (goalKeys.has(tileKey(current.tile))) {
      const path = [current.tile];
      let previous = parents.get(tileKey(current.tile));
      while (previous) {
        path.unshift(previous);
        previous = parents.get(tileKey(previous));
      }
      return path;
    }
    for (const tile of adjacentTiles(current.tile)) {
      const cost = current.cost + 1;
      if (!walkable(tile) || cost >= (costs.get(tileKey(tile)) ?? Infinity))
        continue;
      costs.set(tileKey(tile), cost);
      parents.set(tileKey(tile), current.tile);
      open.push({ tile, cost, score: cost + heuristic(tile) });
    }
  }
  throw new EngineError(
    'PATH_BLOCKED',
    `${targets.map(tileKey).join('; ') || '(no target tiles)'}: expected a reachable, free, walkable destination from ${tileKey(start)}.`,
  );
}
