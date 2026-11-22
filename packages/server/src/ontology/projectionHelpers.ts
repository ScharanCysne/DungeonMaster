import { nodeSchema, edgeSchemas } from '@dungeon/shared';
import type {
  Edge,
  EntityId,
  Holder,
  ItemId,
  LocationId,
  Node,
  Provenance,
} from '@dungeon/shared';
import type { GraphMutation, GraphNode, NodeProps } from './mutations.js';

export type EdgeDraft = {
  [T in Edge['type']]: Omit<Extract<Edge, { type: T }>, keyof Provenance>;
}[Edge['type']];

export function edgeMutation(
  edge: EdgeDraft,
  provenance: Provenance,
): GraphMutation {
  return { type: 'upsertEdge', edge: { ...edge, ...provenance } };
}
export function props(id: EntityId, properties: NodeProps): GraphMutation {
  return { type: 'setNodeProps', id, props: properties };
}
export function holderMutation(
  item: ItemId,
  holder: Holder,
  provenance: Provenance,
): GraphMutation {
  switch (holder.kind) {
    case 'character':
      return edgeMutation(
        { type: 'CARRIES', from: holder.id, to: item, properties: {} },
        provenance,
      );
    case 'container':
      return edgeMutation(
        { type: 'CONTAINS', from: holder.id, to: item, properties: {} },
        provenance,
      );
    case 'location':
      return edgeMutation(
        { type: 'LOCATED_IN', from: item, to: holder.id, properties: {} },
        provenance,
      );
  }
}
export function removeHolder(item: ItemId): GraphMutation[] {
  return [
    {
      type: 'removeEdges',
      filter: { types: ['CARRIES', 'CONTAINS', 'EQUIPPED'], to: item },
    },
    { type: 'removeEdges', filter: { types: ['LOCATED_IN'], from: item } },
  ];
}
export function debugNode(node: GraphNode): Node {
  return nodeSchema.parse(
    'role' in node
      ? Object.fromEntries(
          Object.entries(node).filter(([key]) => key !== 'tile'),
        )
      : node,
  );
}
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function locatedEdge(
  from: EntityId,
  to: LocationId,
  provenance: Provenance,
) {
  return edgeSchemas.LOCATED_IN.parse({
    type: 'LOCATED_IN',
    from,
    to,
    properties: {},
    ...provenance,
  });
}
