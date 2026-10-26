import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/index.js';
import { gridFixture } from '../engine/testing/fixtures.js';
import { seededStore, ontologySeed } from './testing/fixtures.js';
import { verify } from './verify.js';
import type { GraphMutation } from './mutations.js';

const driftCases: { entity: string; field: string; mutation: GraphMutation }[] =
  [
    {
      entity: 'char:player',
      field: 'hp',
      mutation: { type: 'setNodeProps', id: 'char:player', props: { hp: 3 } },
    },
    {
      entity: 'char:player',
      field: 'tile',
      mutation: {
        type: 'setNodeProps',
        id: 'char:player',
        props: { tile: { x: 7, y: 3 } },
      },
    },
    {
      entity: 'char:player',
      field: 'gold',
      mutation: {
        type: 'setNodeProps',
        id: 'char:player',
        props: { gold: 999 },
      },
    },
    {
      entity: 'char:player',
      field: 'LOCATED_IN',
      mutation: {
        type: 'removeEdges',
        filter: { types: ['LOCATED_IN'], from: 'char:player' },
      },
    },
    {
      entity: 'item:quest',
      field: 'holder',
      mutation: {
        type: 'removeEdges',
        filter: { types: ['CONTAINS'], to: 'item:quest' },
      },
    },
    {
      entity: 'container:box',
      field: 'locked',
      mutation: {
        type: 'setNodeProps',
        id: 'container:box',
        props: { locked: true },
      },
    },
    {
      entity: 'char:player',
      field: 'EQUIPPED',
      mutation: {
        type: 'upsertEdge',
        edge: {
          type: 'EQUIPPED',
          from: 'char:player',
          to: 'item:rock',
          properties: { slot: 'main_hand' },
          createdBy: 'engine',
          createdAtBeat: 1,
        },
      },
    },
  ];

describe('hard-state verification', () => {
  it('is clean after seed projection', async () => {
    const store = await seededStore();
    expect(
      await verify(
        new Engine(ontologySeed(), gridFixture(), 'fixture').state,
        store,
      ),
    ).toEqual([]);
  });
  it.each(driftCases)(
    'names $entity, $field and both values for injected drift',
    async ({ entity, field, mutation }) => {
      const store = await seededStore();
      await store.apply([mutation]);
      const messages = await verify(
        new Engine(ontologySeed(), gridFixture(), 'fixture').state,
        store,
      );
      expect(
        messages.some(
          (message) =>
            message.includes(entity) &&
            message.includes(field) &&
            message.includes('engine=') &&
            message.includes('graph='),
        ),
      ).toBe(true);
      if (field === 'hp')
        expect(messages).toContain('char:player hp: engine=12, graph=3');
    },
  );
  it('detects extra physical nodes and orphan hard-state edges', async () => {
    const store = await seededStore();
    const item = await store.getNode('item:rock');
    if (!item || !('questCritical' in item)) throw new Error('Missing fixture');
    await store.apply([
      { type: 'upsertNode', node: { ...item, id: 'item:ghost' } },
      {
        type: 'upsertEdge',
        edge: {
          type: 'CARRIES',
          from: 'char:player',
          to: 'item:ghost',
          properties: {},
          createdBy: 'engine',
          createdAtBeat: 1,
        },
      },
    ]);
    const messages = await verify(
      new Engine(ontologySeed(), gridFixture(), 'fixture').state,
      store,
    );
    expect(messages).toContain(
      'item:ghost existence: engine="absent", graph="present"',
    );
    expect(
      messages.some(
        (message) =>
          message.includes('CARRIES') && message.includes('absent endpoint'),
      ),
    ).toBe(true);
  });
});
