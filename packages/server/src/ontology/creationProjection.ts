import type { EventPayload, Provenance } from '@dungeon/shared';
import type { GraphMutation } from './mutations.js';
import { locatedEdge, removeHolder } from './projectionHelpers.js';

export function projectCreatedEntity(
  payload: EventPayload<'EntityCreated'>,
  provenance: Provenance,
): GraphMutation[] {
  const { entity, edges, position } = payload;
  const positioned = 'role' in entity || 'locked' in entity;
  const mutations: GraphMutation[] = [
    {
      type: 'upsertNode',
      node: {
        ...entity,
        ...provenance,
        ...(position && positioned ? { tile: position.tile } : {}),
      },
    },
  ];
  for (const edge of edges) {
    if (edge.type === 'EQUIPPED') continue;
    if (edge.type === 'CARRIES' || edge.type === 'CONTAINS')
      mutations.push(...removeHolder(edge.to));
    if (edge.type === 'LOCATED_IN')
      mutations.push({
        type: 'removeEdges',
        filter: { types: ['LOCATED_IN'], from: edge.from },
      });
    mutations.push({ type: 'upsertEdge', edge: { ...edge, ...provenance } });
  }
  for (const edge of edges) {
    if (edge.type !== 'EQUIPPED') continue;
    mutations.push(
      {
        type: 'removeEdges',
        filter: {
          types: ['EQUIPPED'],
          from: edge.from,
          slot: edge.properties.slot,
        },
      },
      { type: 'upsertEdge', edge: { ...edge, ...provenance } },
    );
  }
  if (
    position &&
    (positioned ||
      ('questCritical' in entity &&
        !edges.some(
          (edge) =>
            ((edge.type === 'CARRIES' || edge.type === 'CONTAINS') &&
              edge.to === entity.id) ||
            (edge.type === 'LOCATED_IN' && edge.from === entity.id),
        )))
  )
    mutations.push(
      {
        type: 'removeEdges',
        filter: { types: ['LOCATED_IN'], from: entity.id },
      },
      {
        type: 'upsertEdge',
        edge: locatedEdge(entity.id, position.locationId, provenance),
      },
    );
  return mutations;
}
