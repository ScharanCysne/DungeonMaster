import type { EntityId, Graph, Tile } from '@dungeon/shared';
import type { WorldState } from '../store/types';

export function dmOverlay(graph: Graph, world: WorldState) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  function position(
    id: EntityId,
    visited = new Set<EntityId>(),
  ): { tile: Tile; approximate: boolean } | null {
    if (visited.has(id)) return null;
    visited.add(id);
    const visible = world.positions[id];
    if (visible) return { tile: visible.tile, approximate: false };
    const node = nodes.get(id);
    if (node && 'tile' in node) return { tile: node.tile, approximate: false };
    const held = graph.edges.find(
      (edge) => ['CONTAINS', 'CARRIES'].includes(edge.type) && edge.to === id,
    );
    if (held) return position(held.from, visited);
    const located = graph.edges.find(
      (edge) => edge.type === 'LOCATED_IN' && edge.from === id,
    );
    const location = located ? nodes.get(located.to) : null;
    if (location && 'tileBounds' in location)
      return {
        tile: { x: location.tileBounds.x, y: location.tileBounds.y },
        approximate: true,
      };
    return null;
  }
  // Held items are described by their holder's note rather than drawn twice.
  const held = new Set<EntityId>(
    graph.edges
      .filter((edge) => edge.type === 'CONTAINS' || edge.type === 'CARRIES')
      .map((edge) => edge.to),
  );
  const secret = (id: EntityId) => {
    const node = nodes.get(id);
    return (
      Boolean(node && 'hidden' in node && node.hidden) || !world.entities[id]
    );
  };
  return graph.nodes.flatMap((entity) => {
    if (!('hidden' in entity) || held.has(entity.id)) return [];
    // Only state the player cannot know is worth marking: what is concealed, and
    // what a container conceals. Out-of-sight carried items are not secrets.
    const hidden = entity.hidden;
    const contents = graph.edges.filter(
      (edge) =>
        edge.type === 'CONTAINS' &&
        edge.from === entity.id &&
        (hidden || secret(edge.to)),
    );
    const spot = position(entity.id);
    if ((!hidden && !contents.length) || !spot) return [];
    const notes = [
      hidden ? 'hidden' : '',
      ...contents.map((edge) => `holds ${edge.to}`),
      spot.approximate ? 'location only; tile unknown' : '',
    ].filter(Boolean);
    return [{ entity, hidden, ...spot, note: notes.join(' · ') }];
  });
}
