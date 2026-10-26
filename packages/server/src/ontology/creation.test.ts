import { expect, it } from 'vitest';
import { nodeSchema } from '@dungeon/shared';
import type { Edge, EventPayload, GameEvent } from '@dungeon/shared';
import { Engine } from '../engine/index.js';
import { gridFixture } from '../engine/testing/fixtures.js';
import { project } from './projector.js';
import { verify } from './verify.js';
import { debugNode } from './projectionHelpers.js';
import {
  graphSnapshot,
  record,
  seededStore,
  seedRecord,
} from './testing/fixtures.js';

it('replays generated hard-state entities, placements, ownership, equipment, and keys', async () => {
  const store = await seededStore();
  const records: GameEvent[] = [seedRecord()];
  const character = await store.getNode('char:seller');
  const container = await store.getNode('container:box');
  const item = await store.getNode('item:rock');
  const location = await store.getNode('loc:spot');
  if (!character || !container || !item || !location)
    throw new Error('Missing fixture');
  const provenance = { createdBy: 'generator:item', createdAtBeat: 1 } as const;
  const equipped: Edge = {
    type: 'EQUIPPED',
    from: 'char:new',
    to: 'item:new',
    properties: { slot: 'main_hand' },
    ...provenance,
  };
  const payloads: EventPayload<'EntityCreated'>[] = [
    {
      entity: nodeSchema.parse({ ...debugNode(character), id: 'char:new' }),
      edges: [],
      position: { locationId: 'loc:other', tile: { x: 7, y: 3 } },
    },
    {
      entity: nodeSchema.parse({ ...container, id: 'container:new' }),
      edges: [
        {
          type: 'LOCATED_IN',
          from: 'container:new',
          to: 'loc:other',
          properties: {},
          ...provenance,
        },
      ],
    },
    {
      entity: nodeSchema.parse({
        ...item,
        id: 'item:new',
        properties: ['key_for:container:new'],
      }),
      edges: [
        equipped,
        {
          type: 'CARRIES',
          from: 'char:new',
          to: 'item:new',
          properties: {},
          ...provenance,
        },
      ],
    },
    {
      entity: nodeSchema.parse({ ...item, id: 'item:contained' }),
      edges: [
        {
          type: 'CONTAINS',
          from: 'container:new',
          to: 'item:contained',
          properties: {},
          ...provenance,
        },
      ],
    },
    {
      entity: nodeSchema.parse({ ...location, id: 'loc:new' }),
      edges: [
        {
          type: 'PART_OF',
          from: 'loc:new',
          to: 'loc:other',
          properties: {},
          ...provenance,
        },
      ],
    },
    {
      entity: nodeSchema.parse({ ...item, id: 'item:floor-new' }),
      edges: [],
      position: { locationId: 'loc:new', tile: { x: 4, y: 0 } },
    },
  ];
  for (const [seq, payload] of payloads.entries()) {
    const event = record('EntityCreated', payload, {
      seq,
      createdBy: 'generator:item',
    });
    records.push(event);
    await store.apply(project(event));
    const once = await graphSnapshot(store);
    await store.apply(project(event));
    expect(await graphSnapshot(store)).toEqual(once);
    expect(
      await verify(Engine.fromLog(records, gridFixture()).state, store),
    ).toEqual([]);
  }
  const engine = Engine.fromLog(records, gridFixture());
  expect(engine.state.containers.get('container:new')?.keyIds).toEqual([
    'item:new',
  ]);
  expect(engine.state.characters.get('char:new')?.equipped).toEqual({
    main_hand: 'item:new',
  });
  expect(engine.state.locations.get('loc:new')?.partOf).toBe('loc:other');
  expect(engine.state.items.get('item:floor-new')?.holder).toEqual({
    kind: 'location',
    id: 'loc:new',
  });
});
