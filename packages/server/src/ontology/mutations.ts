import type {
  CharacterId,
  Edge,
  EntityId,
  EquipmentSlot,
  FactId,
  Node,
  Quest,
  Tile,
} from '@dungeon/shared';

// Character tiles are projection metadata; shared debug sheets omit them.
export type GraphNode = Node & { tile?: Tile };
export interface EdgeFilter {
  types?: readonly Edge['type'][];
  from?: EntityId;
  to?: EntityId;
  touching?: EntityId;
  slot?: EquipmentSlot;
}
export interface NodeProps {
  tile?: Tile;
  hp?: number;
  maxHp?: number;
  conscious?: boolean;
  hidden?: boolean;
  gold?: number;
  locked?: boolean;
  opened?: boolean;
  status?: Quest['status'];
}
export type GraphMutation =
  | { type: 'upsertNode'; node: GraphNode }
  | { type: 'setNodeProps'; id: EntityId; props: NodeProps }
  | { type: 'removeNode'; id: EntityId }
  | { type: 'upsertEdge'; edge: Edge }
  | { type: 'removeEdges'; filter: EdgeFilter }
  | {
      type: 'retractSupersededKnows';
      learner: CharacterId;
      fact: FactId;
      beat: number;
    };

export function edgeKey(edge: Edge): string {
  const qualifier =
    edge.type === 'EQUIPPED'
      ? edge.properties.slot
      : edge.type === 'INVOLVES'
        ? edge.properties.role
        : '';
  return JSON.stringify([edge.type, edge.from, edge.to, qualifier]);
}
export function matchesEdge(edge: Edge, filter: EdgeFilter): boolean {
  return (
    (!filter.types || filter.types.includes(edge.type)) &&
    (!filter.from || edge.from === filter.from) &&
    (!filter.to || edge.to === filter.to) &&
    (!filter.touching ||
      edge.from === filter.touching ||
      edge.to === filter.touching) &&
    (!filter.slot ||
      (edge.type === 'EQUIPPED' && edge.properties.slot === filter.slot))
  );
}
