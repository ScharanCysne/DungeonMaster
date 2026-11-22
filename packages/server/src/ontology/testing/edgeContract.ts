import { expect, it } from 'vitest';
import type { Edge, Fact } from '@dungeon/shared';
import type { OntologyStore } from '../OntologyStore.js';
import type { EdgeFilter } from '../mutations.js';
import { matchesEdge } from '../mutations.js';
import { project } from '../projector.js';
import { record } from './fixtures.js';

export function runEdgeContract(getStore: () => OntologyStore) {
  it('keeps arbitrary relationship text as data', async () => {
    const store = getStore();
    const edge: Edge = {
      type: 'WANTS',
      from: 'char:player',
      to: 'item:rock',
      properties: { why: "A quote: ' and Cypher: MATCH (n) DETACH DELETE n" },
      createdBy: 'dm',
      createdAtBeat: 2,
    };
    await store.apply([{ type: 'upsertEdge', edge }]);
    expect(await store.edges({ types: ['WANTS'] })).toEqual([edge]);
    expect(await store.getNode('char:player')).toBeDefined();
  });
  it('replaces edge properties, preserves provenance and distinguishes slots and roles', async () => {
    const store = getStore();
    const member = (
      await store.edges({ types: ['MEMBER_OF'], from: 'char:seller' })
    )[0];
    if (!member || member.type !== 'MEMBER_OF')
      throw new Error('Missing membership fixture');
    await store.apply([
      {
        type: 'upsertEdge',
        edge: {
          ...member,
          properties: {},
          createdBy: 'dm',
          createdAtBeat: 9,
        },
      },
    ]);
    expect(
      await store.edges({ types: ['MEMBER_OF'], from: member.from }),
    ).toEqual([{ ...member, properties: {} }]);
    for (const slot of ['main_hand', 'off_hand'] as const) {
      const edge: Edge = {
        type: 'EQUIPPED',
        from: 'char:player',
        to: 'item:rock',
        properties: { slot },
        createdBy: 'engine',
        createdAtBeat: 1,
      };
      await store.apply([
        { type: 'upsertEdge', edge },
        { type: 'upsertEdge', edge },
      ]);
    }
    expect(await store.edges({ types: ['EQUIPPED'] })).toHaveLength(2);
    await store.apply(
      project(
        record('IntentReceived', {
          text: 'Look',
          selection: ['char:player'],
        }),
      ),
    );
    expect(
      (await store.edges({ types: ['INVOLVES'], to: 'char:player' })).map(
        (edge) => edge.properties,
      ),
    ).toEqual([{ role: 'actor' }, { role: 'target' }]);
  });
  it.each<EdgeFilter>([
    {},
    { types: [] },
    { types: ['KNOWS', 'ABOUT'] },
    { from: 'char:player' },
    { to: 'fact:rumour' },
    { touching: 'char:player' },
    { slot: 'main_hand' },
    {
      types: ['EQUIPPED'],
      from: 'char:player',
      to: 'item:rock',
      touching: 'item:rock',
      slot: 'main_hand',
    },
    { types: ['KNOWS'], slot: 'main_hand' },
    { from: 'char:missing' },
  ])('uses identical filters for reads and deletion: %j', async (filter) => {
    const store = getStore();
    await store.apply([
      {
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
    ]);
    const before = await store.edges();
    expect(await store.edges(filter)).toEqual(
      before.filter((edge) => matchesEdge(edge, filter)),
    );
    await store.apply([{ type: 'removeEdges', filter }]);
    expect(await store.edges()).toEqual(
      before.filter((edge) => !matchesEdge(edge, filter)),
    );
  });
  it('detaches deleted nodes and permits repeated removal', async () => {
    const store = getStore();
    await store.apply([
      { type: 'removeNode', id: 'char:player' },
      { type: 'removeNode', id: 'char:player' },
    ]);
    expect(await store.getNode('char:player')).toBeUndefined();
    expect(await store.edges({ touching: 'char:player' })).toEqual([]);
    expect(await store.getNode('item:rock')).toBeDefined();
  });
  it('retracts only direct superseded beliefs at the earliest beat and preserves prior retraction on upsert', async () => {
    const store = getStore();
    const fact = await store.getNode('fact:rumour');
    if (!fact || !('statement' in fact))
      throw new Error('Missing fact fixture');
    const correction: Fact = { ...fact, id: 'fact:correction' };
    await store.apply(
      project(
        record('FactCreated', {
          fact: correction,
          about: [],
          originOf: [],
          supersedes: 'fact:rumour',
        }),
      ),
    );
    await store.apply([
      {
        type: 'upsertEdge',
        edge: {
          type: 'SUPERSEDES',
          from: 'fact:rumour',
          to: 'fact:secret',
          properties: {},
          createdBy: 'dm',
          createdAtBeat: 1,
        },
      },
    ]);
    const secretKnowledge: Edge = {
      type: 'KNOWS',
      from: 'char:player',
      to: 'fact:secret',
      properties: { since: 1, source: 'told', confidence: 0.75 },
      createdBy: 'dm',
      createdAtBeat: 1,
    };
    await store.apply([{ type: 'upsertEdge', edge: secretKnowledge }]);
    for (const beat of [5, 8, 3])
      await store.apply([
        {
          type: 'retractSupersededKnows',
          learner: 'char:player',
          fact: correction.id,
          beat,
        },
      ]);
    const old = (
      await store.edges({
        types: ['KNOWS'],
        from: 'char:player',
        to: 'fact:rumour',
      })
    )[0];
    if (!old || old.type !== 'KNOWS')
      throw new Error('Missing knowledge fixture');
    await store.apply([
      {
        type: 'upsertEdge',
        edge: {
          ...old,
          createdBy: 'dm',
          createdAtBeat: 9,
          properties: {
            since: 9,
            source: 'told',
            confidence: 0.5,
            retractedAtBeat: 1,
          },
        },
      },
    ]);
    expect(
      await store.edges({
        types: ['KNOWS'],
        from: 'char:player',
        to: 'fact:rumour',
      }),
    ).toMatchObject([
      {
        createdBy: 'seed',
        createdAtBeat: 0,
        properties: { retractedAtBeat: 3, since: 9, confidence: 0.5 },
      },
    ]);
    expect(
      await store.edges({
        types: ['KNOWS'],
        from: 'char:player',
        to: 'fact:secret',
      }),
    ).toEqual([secretKnowledge]);
    expect(
      (
        await store.edges({
          types: ['KNOWS'],
          from: 'char:seller',
          to: 'fact:rumour',
        })
      )[0]?.properties,
    ).not.toHaveProperty('retractedAtBeat');
  });
}
