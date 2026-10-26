import type { GameEventOf, Holder, ItemId } from '@dungeon/shared';
import { requireValue } from './errors.js';
import type { EngineState } from './state.js';

export function detachItem(state: EngineState, id: ItemId): void {
  for (const character of state.characters.values()) {
    character.inventory = character.inventory.filter((item) => item !== id);
    for (const slot of ['main_hand', 'off_hand', 'armor', 'accessory'] as const)
      if (character.equipped[slot] === id) delete character.equipped[slot];
  }
  for (const container of state.containers.values())
    container.contents = container.contents.filter((item) => item !== id);
}

export function attachItem(
  state: EngineState,
  id: ItemId,
  holder: Holder,
): void {
  detachItem(state, id);
  requireValue(state.items.get(id), id).holder = structuredClone(holder);
  if (holder.kind === 'character')
    requireValue(state.characters.get(holder.id), holder.id).inventory.push(id);
  if (holder.kind === 'container')
    requireValue(state.containers.get(holder.id), holder.id).contents.push(id);
}

export function registerEntity(
  state: EngineState,
  payload: GameEventOf<'EntityCreated'>['payload'],
): void {
  const { createdBy, createdAtBeat, ...entity } = payload.entity;
  // Provenance belongs to the projection, not the engine's seed-shaped records.
  void createdBy;
  void createdAtBeat;
  if ('role' in entity) {
    const position = requireValue(payload.position, `${entity.id} position`);
    state.characters.set(entity.id, {
      ...entity,
      locationId: position.locationId,
      tile: position.tile,
      inventory: [],
      equipped: {},
    });
  } else if ('locked' in entity) {
    const edge = payload.edges.find(
      (edge) => edge.type === 'LOCATED_IN' && edge.from === entity.id,
    );
    const locationId =
      payload.position?.locationId ??
      (edge?.type === 'LOCATED_IN' ? edge.to : undefined);
    state.containers.set(entity.id, {
      ...entity,
      locationId: requireValue(locationId, `${entity.id} location`),
      tile: payload.position?.tile ?? entity.tile,
      contents: [],
      keyIds: [...state.items.values()]
        .filter((item) => item.properties.includes(`key_for:${entity.id}`))
        .map((item) => item.id),
    });
  } else if ('questCritical' in entity) {
    let holder: Holder | undefined;
    for (const edge of payload.edges) {
      if (edge.type === 'CARRIES' && edge.to === entity.id)
        holder = { kind: 'character', id: edge.from };
      if (edge.type === 'CONTAINS' && edge.to === entity.id)
        holder = { kind: 'container', id: edge.from };
      if (edge.type === 'LOCATED_IN' && edge.from === entity.id)
        holder = { kind: 'location', id: edge.to };
    }
    if (!holder && payload.position)
      holder = { kind: 'location', id: payload.position.locationId };
    const resolved = requireValue(holder, `${entity.id} holder`);
    state.items.set(entity.id, { ...entity, holder: resolved });
    attachItem(state, entity.id, resolved);
    for (const container of state.containers.values())
      if (
        entity.properties.includes(`key_for:${container.id}`) &&
        !container.keyIds.includes(entity.id)
      )
        container.keyIds.push(entity.id);
  } else if ('tileBounds' in entity) {
    const parent = payload.edges.find(
      (edge) => edge.type === 'PART_OF' && edge.from === entity.id,
    );
    state.locations.set(entity.id, {
      ...entity,
      ...(parent?.type === 'PART_OF' ? { partOf: parent.to } : {}),
    });
  }
  for (const edge of payload.edges) {
    if (edge.type === 'CARRIES')
      attachItem(state, edge.to, { kind: 'character', id: edge.from });
    if (edge.type === 'CONTAINS')
      attachItem(state, edge.to, { kind: 'container', id: edge.from });
  }
  for (const edge of payload.edges) {
    if (edge.type === 'EQUIPPED')
      requireValue(state.characters.get(edge.from), edge.from).equipped[
        edge.properties.slot
      ] = edge.to;
  }
}
