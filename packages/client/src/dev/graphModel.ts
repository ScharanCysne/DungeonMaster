import type { Edge, EntityId, Graph, Node } from '@dungeon/shared';
import { edgeKey } from '../store/dev';
import type { ClientState, WorldState } from '../store/types';
import { playerId } from '../store/world';

export const TYPE_COLORS: Record<string, string> = {
  player: '#f5b041',
  peer: '#5dade2',
  npc: '#af7ac5',
  item: '#58d68d',
  container: '#cd9b5f',
  feature: '#cd9b5f',
  fact: '#f4d03f',
  quest: '#ec7063',
  faction: '#a3a3a3',
  loc: '#48c9b0',
  event: '#a3a3a3',
};
export const nodeType = (node: Node) =>
  'role' in node ? node.role : (node.id.split(':')[0] ?? 'event');
export const graphFocus = (state: ClientState): EntityId[] =>
  state.selection.ids.length
    ? state.selection.ids
    : Object.values(state.world.entities)
        .filter((node) => 'role' in node && node.role === 'player')
        .map((node) => node.id);

export function dmOnlyEdge(edge: Edge, world: WorldState) {
  if (!world.entities[edge.from] || !world.entities[edge.to]) return true;
  const player = playerId(world);
  if (['KNOWS', 'WITNESSED', 'CARRIES', 'EQUIPPED'].includes(edge.type))
    return edge.from !== player;
  return ['HAS_SECRET', 'WANTS', 'PURSUES', 'ATTITUDE'].includes(edge.type);
}

export function graphModel(
  graph: Graph,
  world: WorldState,
  dmView: boolean,
  changes: ClientState['dev']['changes'],
  changedEntities: EntityId[] = [],
) {
  const nodes = [...graph.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node, index) => ({
      node,
      id: node.id,
      label: node.name,
      order: index,
      color: TYPE_COLORS[nodeType(node)] ?? '#a3a3a3',
      changed:
        changes.nodes.includes(node.id) || changedEntities.includes(node.id),
      selectable:
        !!world.entities[node.id] &&
        !['fact', 'quest', 'event'].includes(nodeType(node)),
    }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge) => {
      const changed = changes.edges.includes(edgeKey(edge));
      const dmOnly = dmOnlyEdge(edge, world);
      return {
        edge,
        id: edgeKey(edge),
        changed,
        dmOnly,
        dashed: changed || (dmView && dmOnly),
        color: changed ? '#9b1c1c' : '#a08868',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    nodes,
    edges,
    layout: { name: 'concentric', order: nodes.map((node) => node.id) },
  };
}
export type GraphModel = ReturnType<typeof graphModel>;

export function neo4jLink(focus: EntityId[]) {
  const query = `MATCH (n) WHERE n.id IN ${JSON.stringify(focus)} OPTIONAL MATCH (n)-[r]-(m) RETURN n,r,m`;
  return `http://localhost:7474/browser/?cmd=edit&arg=${encodeURIComponent(query)}`;
}
