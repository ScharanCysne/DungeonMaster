import { characterSchema, containerSchema, itemSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import {
  entry,
  fixture,
  rejects,
  seedFixture,
  value,
} from './testing/fixtures.js';

const seed = seedFixture();
const { holder, ...seedItem } = entry(seed.items, 'item:rock');
const item = itemSchema.parse({
  ...seedItem,
  id: 'item:generated',
  createdBy: 'generator:item',
  createdAtBeat: 1,
});
const {
  location: npcLocation,
  tile,
  ...seedNpc
} = entry(seed.characters, 'char:seller');
const npc = characterSchema.parse({
  ...seedNpc,
  id: 'char:generated',
  createdBy: 'generator:npc',
  createdAtBeat: 1,
});
const { location: featureLocation, ...seedFeature } = entry(
  seed.containers,
  'container:box',
);
const feature = containerSchema.parse({
  ...seedFeature,
  id: 'container:generated',
  createdBy: 'generator:feature',
  createdAtBeat: 1,
});

it('creates an atomic batch and captures command-time witnesses', () => {
  const engine = fixture();
  const result = engine.createEntities([
    { kind: 'npc', entity: npc, locationId: npcLocation, edges: [] },
    { kind: 'item', entity: item, holder: { kind: 'character', id: npc.id } },
  ]);
  expect(value(result)).toHaveLength(2);
  const event = engine.collectEvents()[0];
  expect(event).toMatchObject({
    type: 'EntityCreated',
    actor: null,
    createdBy: 'generator:npc',
  });
  expect(event?.witnesses).toEqual(
    expect.arrayContaining(['char:player', npc.id]),
  );
  value(engine.move({ actor: 'char:player', to: 'loc:other' }));
  expect(engine.collectEvents()[0]).toEqual(event);
  expect(engine.state.characters.get(npc.id)?.inventory).toEqual([item.id]);
  engine.rollback();
  expect(engine.state.characters.has(npc.id)).toBe(false);
  expect(engine.state.items.has(item.id)).toBe(false);
  expect(engine.collectEvents()).toEqual([]);
});

it('rejects a missing holder without registering earlier entities in the batch', () => {
  const engine = fixture();
  rejects(
    engine,
    () =>
      engine.createEntities([
        { kind: 'npc', entity: npc, locationId: npcLocation, edges: [] },
        {
          kind: 'item',
          entity: item,
          holder: { kind: 'container', id: 'container:missing' },
        },
      ]),
    'NO_SUCH_ENTITY',
    'container:missing',
  );
});

it('rejects quest-critical creation at the transaction boundary', () => {
  const engine = fixture();
  const result = engine.createEntities([
    { kind: 'item', entity: { ...item, questCritical: true }, holder },
  ]);
  expect(result.ok).toBe(false);
  expect(engine.state.items.has(item.id)).toBe(false);
  expect(engine.collectEvents()).toEqual([]);
});

it('rejects duplicate IDs without overwriting hard state', () => {
  const engine = fixture();
  value(engine.createEntities([{ kind: 'item', entity: item, holder }]));
  rejects(
    engine,
    () => engine.createEntities([{ kind: 'item', entity: item, holder }]),
    'ENTITY_EXISTS',
  );
});

it('rejects creation in a location with no free walkable tile', () => {
  const engine = fixture((_, grid) => {
    for (const row of grid.walkable) row.fill(false);
  });
  rejects(
    engine,
    () =>
      engine.createEntities([
        { kind: 'npc', entity: npc, locationId: npcLocation, edges: [] },
      ]),
    'PATH_BLOCKED',
  );
});

it('excludes characters, containers and doors and breaks equal distances by row then column', () => {
  const engine = fixture((_, grid) => {
    grid.doors = [{ tile: { x: 2, y: 1 }, locked: false }];
  });
  const result = value(
    engine.createEntities([
      {
        kind: 'feature',
        entity: { ...feature, opened: true },
        locationId: featureLocation,
      },
    ]),
  );
  expect(result[0]?.position?.tile).toEqual({ x: 1, y: 2 });
  expect(engine.state.containers.get(feature.id)).toMatchObject({
    opened: false,
    contents: [],
  });
  expect(tile).toEqual({ x: 3, y: 2 });
});

it('captures private-room lighting and consciousness consistently for creation', () => {
  const engine = fixture((seed) => {
    entry(seed.locations, 'loc:room').lit = false;
    entry(seed.characters, 'char:watcher').tags = ['darkvision'];
    entry(seed.characters, 'char:peer').hp = 0;
    entry(seed.characters, 'char:peer').conscious = false;
  });
  value(engine.createEntities([{ kind: 'item', entity: item, holder }]));
  expect(engine.collectEvents()[0]?.witnesses).toEqual([
    'char:player',
    'char:watcher',
  ]);
});
