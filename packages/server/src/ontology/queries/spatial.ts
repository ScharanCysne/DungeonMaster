import type { EntityId, Location } from '@dungeon/shared';
import type { GraphNode } from '../mutations.js';
import type { OntologyReader } from '../OntologyStore.js';

export async function spatialView(reader: OntologyReader) {
  const [nodes, edges] = await Promise.all([
    reader.nodes(),
    reader.edges({ types: ['LOCATED_IN', 'PART_OF', 'CARRIES', 'CONTAINS'] }),
  ]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<EntityId, EntityId>();
  for (const edge of edges) {
    if (edge.type === 'LOCATED_IN' || edge.type === 'PART_OF')
      parents.set(edge.from, edge.to);
    if (edge.type === 'CARRIES' || edge.type === 'CONTAINS')
      parents.set(edge.to, edge.from);
  }
  function ancestor(
    id: EntityId,
    kind: Location['kind'],
  ): Location | undefined {
    const visited = new Set<EntityId>();
    let current: EntityId | undefined = id;
    while (current && !visited.has(current)) {
      visited.add(current);
      const node = byId.get(current);
      if (node && 'tileBounds' in node && node.kind === kind) return node;
      const parent = parents.get(current);
      if (
        !parent &&
        kind === 'room' &&
        node &&
        'tileBounds' in node &&
        node.kind === 'spot'
      ) {
        const { x, y } = node.tileBounds;
        return nodes
          .filter(
            (candidate): candidate is Location =>
              'tileBounds' in candidate &&
              candidate.kind === 'room' &&
              x >= candidate.tileBounds.x &&
              y >= candidate.tileBounds.y &&
              x < candidate.tileBounds.x + candidate.tileBounds.w &&
              y < candidate.tileBounds.y + candidate.tileBounds.h,
          )
          .sort(
            (a, b) =>
              a.tileBounds.w * a.tileBounds.h - b.tileBounds.w * b.tileBounds.h,
          )[0];
      }
      current = parent;
    }
    return undefined;
  }
  return {
    nodes,
    room: (id: EntityId) => ancestor(id, 'room'),
    building: (id: EntityId) => ancestor(id, 'building'),
    directlyLocated: new Set<EntityId>(
      edges
        .filter((edge) => edge.type === 'LOCATED_IN')
        .map((edge) => edge.from),
    ),
  };
}
export function physical(node: GraphNode): boolean {
  return 'role' in node || 'locked' in node || 'questCritical' in node;
}
