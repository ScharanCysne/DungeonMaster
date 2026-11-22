import { characterSchema, containerSchema, itemSchema } from '@dungeon/shared';
import type {
  Character,
  Container,
  Edge,
  EventPayload,
  Holder,
  Item,
  LocationId,
  Tile,
} from '@dungeon/shared';
import { requireRule, requireValue } from '../errors.js';
import type { CommandContext } from '../events.js';
import { registerEntity } from '../replayEntities.js';
import { entityPosition, tilesIn } from '../spatial.js';
import type { EngineState } from '../state.js';

export type EntityCreation =
  | { kind: 'item'; entity: Item; holder: Holder }
  | { kind: 'npc'; entity: Character; locationId: LocationId; edges: Edge[] }
  | { kind: 'feature'; entity: Container; locationId: LocationId };

function freeTile(
  state: EngineState,
  locationId: LocationId,
  preferred?: Tile,
): Tile {
  const location = requireValue(state.locations.get(locationId), locationId);
  const anchor = preferred ?? location.tileBounds;
  const occupied = [...state.characters.values(), ...state.containers.values()];
  const distance = (tile: Tile) =>
    Math.abs(tile.x - anchor.x) + Math.abs(tile.y - anchor.y);
  const tile = tilesIn(location.tileBounds)
    .filter(
      (tile) =>
        state.grid.walkable[tile.y]?.[tile.x] &&
        !occupied.some(
          (entity) => entity.tile.x === tile.x && entity.tile.y === tile.y,
        ) &&
        !state.grid.doors?.some(
          (door) => door.tile.x === tile.x && door.tile.y === tile.y,
        ),
    )
    .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)[0];
  requireRule(
    !!tile,
    'PATH_BLOCKED',
    `${locationId}: expected a free walkable tile inside the location.`,
  );
  return requireValue(tile, locationId);
}

function payloadFor(
  state: EngineState,
  input: EntityCreation,
): EventPayload<'EntityCreated'> {
  const provenance = {
    createdBy: input.entity.createdBy,
    createdAtBeat: input.entity.createdAtBeat,
  };
  requireRule(
    ![
      ...state.items.values(),
      ...state.characters.values(),
      ...state.containers.values(),
      ...state.locations.values(),
    ].some((node) => node.id === input.entity.id),
    'ENTITY_EXISTS',
    `${input.entity.id}: expected a new entity ID.`,
  );
  if (input.kind === 'item') {
    const entity = itemSchema.parse(input.entity);
    const { holder } = input;
    if (holder.kind === 'character')
      requireValue(state.characters.get(holder.id), holder.id);
    if (holder.kind === 'container')
      requireValue(state.containers.get(holder.id), holder.id);
    if (holder.kind === 'location')
      requireValue(state.locations.get(holder.id), holder.id);
    const edge: Edge =
      holder.kind === 'character'
        ? {
            type: 'CARRIES',
            from: holder.id,
            to: entity.id,
            properties: {},
            ...provenance,
          }
        : holder.kind === 'container'
          ? {
              type: 'CONTAINS',
              from: holder.id,
              to: entity.id,
              properties: {},
              ...provenance,
            }
          : {
              type: 'LOCATED_IN',
              from: entity.id,
              to: holder.id,
              properties: {},
              ...provenance,
            };
    const { locationId, tile } = entityPosition(state, holder.id);
    return { entity, edges: [edge], position: { locationId, tile } };
  }
  const tile = freeTile(
    state,
    input.locationId,
    input.kind === 'feature' ? input.entity.tile : undefined,
  );
  const entity =
    input.kind === 'feature'
      ? containerSchema.parse({ ...input.entity, tile, opened: false })
      : characterSchema.parse(input.entity);
  if ('role' in entity)
    requireRule(
      entity.role === 'npc' &&
        entity.hp <= entity.maxHp &&
        entity.conscious === entity.hp > 0,
      'INVALID_CHARACTER',
      `${entity.id}: expected an NPC with consistent HP and consciousness.`,
    );
  const edges: Edge[] = [
    {
      type: 'LOCATED_IN',
      from: entity.id,
      to: input.locationId,
      properties: {},
      ...provenance,
    },
  ];
  if (input.kind === 'npc') {
    for (const edge of input.edges) {
      requireRule(
        edge.type === 'ATTITUDE' && edge.from === entity.id,
        'INVALID_EDGE',
        `${entity.id}: creation accepts only this NPC's initial attitude edges.`,
      );
      if (edge.type === 'ATTITUDE')
        requireValue(state.characters.get(edge.to), edge.to);
      edges.push(edge);
    }
  }
  return { entity, edges, position: { locationId: input.locationId, tile } };
}

export function createEntities(
  ctx: CommandContext,
  inputs: readonly EntityCreation[],
) {
  const value: EventPayload<'EntityCreated'>[] = [];
  for (const input of inputs) {
    const payload = payloadFor(ctx.state, input);
    registerEntity(ctx.state, payload);
    const position = requireValue(
      payload.position,
      `${input.entity.id} position`,
    );
    ctx.emit(
      { type: 'EntityCreated', payload },
      null,
      position.locationId,
      input.kind === 'npc'
        ? [input.entity.id]
        : input.kind === 'item' && input.holder.kind === 'character'
          ? [input.holder.id]
          : [],
    );
    value.push(payload);
  }
  return { value, facts: value.map(({ entity }) => `Created ${entity.name}.`) };
}
