import { describe, expect, it } from 'vitest';
import { edgeSchema, gameEventSchema, nodeSchema } from '@dungeon/shared';
import type { GameEvent } from '@dungeon/shared';
import { eventPayloads } from '../../../shared/src/testing/event-fixtures.js';
import { envelope, seed } from '../../../shared/src/testing/fixtures.js';
import { MemoryStore } from './MemoryStore.js';
import { project } from './projector.js';
import { debugNode } from './projectionHelpers.js';
import {
  graphSnapshot,
  record,
  seededStore,
  seedRecord,
} from './testing/fixtures.js';

const effects = {
  SeedLoaded: [
    {
      type: 'upsertNode',
      node: { id: 'char:player', createdBy: 'seed', createdAtBeat: 0 },
    },
  ],
  BeatStarted: [],
  IntentReceived: [
    { type: 'upsertNode', node: { id: 'event:1-0', type: 'IntentReceived' } },
  ],
  EntityMoved: [
    { type: 'removeEdges', filter: { types: ['LOCATED_IN'] } },
    { type: 'setNodeProps', props: { tile: { x: 2, y: 1 } } },
  ],
  ItemTransferred: [
    {
      type: 'upsertEdge',
      edge: { type: 'CARRIES', from: 'char:player', to: 'item:quill' },
    },
  ],
  ItemEquipped: [
    {
      type: 'upsertEdge',
      edge: { type: 'EQUIPPED', properties: { slot: 'main_hand' } },
    },
  ],
  ItemUnequipped: [
    { type: 'removeEdges', filter: { types: ['EQUIPPED'], slot: 'main_hand' } },
  ],
  ContainerOpened: [
    { type: 'setNodeProps', id: 'container:box', props: { opened: true } },
    { type: 'setNodeProps', id: 'item:quill', props: { hidden: false } },
  ],
  ContainerUnlocked: [
    { type: 'setNodeProps', id: 'container:box', props: { locked: false } },
  ],
  EntityRevealed: [{ type: 'setNodeProps', props: { hidden: false } }],
  EntityHidden: [{ type: 'setNodeProps', props: { hidden: true } }],
  CheckRolled: [
    { type: 'upsertNode', node: { type: 'CheckRolled', roll: { total: 15 } } },
  ],
  AttackResolved: [
    {
      type: 'upsertNode',
      node: { type: 'AttackResolved', roll: { total: 15 } },
    },
  ],
  DamageApplied: [
    {
      type: 'setNodeProps',
      id: 'char:brann',
      props: { hp: 9, conscious: true },
    },
  ],
  Healed: [
    {
      type: 'setNodeProps',
      id: 'char:player',
      props: { hp: 12, conscious: true },
    },
  ],
  CombatStarted: [{ type: 'upsertNode', node: { type: 'CombatStarted' } }],
  CombatEnded: [{ type: 'upsertNode', node: { type: 'CombatEnded' } }],
  TurnAdvanced: [],
  EntityCreated: [{ type: 'upsertNode', node: { id: 'container:box' } }],
  FactCreated: [
    { type: 'upsertNode', node: { id: 'fact:quill' } },
    { type: 'upsertEdge', edge: { type: 'ABOUT', to: 'item:quill' } },
  ],
  FactLearned: [
    {
      type: 'upsertEdge',
      edge: { type: 'KNOWS', properties: { source: 'read', confidence: 1 } },
    },
    {
      type: 'retractSupersededKnows',
      learner: 'char:player',
      fact: 'fact:quill',
    },
  ],
  AttitudeChanged: [
    {
      type: 'upsertEdge',
      edge: { type: 'ATTITUDE', properties: { value: 10, reason: 'A gift.' } },
    },
  ],
  QuestStatusChanged: [
    { type: 'setNodeProps', id: 'quest:quill', props: { status: 'complete' } },
  ],
  NarrationCommitted: [
    { type: 'upsertNode', node: { type: 'NarrationCommitted' } },
  ],
  CriticRejected: [],
  RecapUpdated: [],
  EpisodeEnded: [
    { type: 'setNodeProps', id: 'quest:quill', props: { status: 'complete' } },
    { type: 'upsertNode', node: { type: 'EpisodeEnded' } },
  ],
  BeatCommitted: [],
} satisfies Record<GameEvent['type'], object[]>;

const catalogue = Object.entries(eventPayloads).map(([type, payload]) =>
  gameEventSchema.parse({ ...envelope, type, payload }),
);

describe('catalogue projection', () => {
  it.each(catalogue)(
    '$type projects its declared effects, valid provenance, and is idempotent',
    async (event) => {
      const store = new MemoryStore();
      const base = structuredClone(seed);
      const player = base.characters[0];
      if (!player) throw new Error('Missing fixture player');
      base.characters.push({ ...player, id: 'char:brann', role: 'npc' });
      await store.apply(project(seedRecord(base)));
      const before = structuredClone(event);
      const mutations = project(event);
      for (const expected of effects[event.type])
        expect(
          mutations.some((mutation) => {
            try {
              expect(mutation).toMatchObject(expected);
              return true;
            } catch {
              return false;
            }
          }),
          JSON.stringify(expected),
        ).toBe(true);
      if (!effects[event.type].length) expect(mutations).toEqual([]);
      expect(event).toEqual(before);
      await store.apply(mutations);
      const once = await graphSnapshot(store);
      await store.apply(project(event));
      expect(await graphSnapshot(store)).toEqual(once);
      for (const node of once.nodes)
        expect(nodeSchema.parse(debugNode(node))).toEqual(debugNode(node));
      for (const edge of once.edges)
        expect(edgeSchema.parse(edge)).toEqual(edge);
    },
  );
  it('projects all seed collections and relationships with seed provenance', async () => {
    const store = await seededStore();
    const graph = await graphSnapshot(store);
    expect(new Set(graph.edges.map((edge) => edge.type))).toEqual(
      new Set([
        'PART_OF',
        'LOCATED_IN',
        'CARRIES',
        'CONTAINS',
        'ABOUT',
        'KNOWS',
        'HAS_SECRET',
        'ATTITUDE',
        'PURSUES',
        'MEMBER_OF',
      ]),
    );
    for (const entity of [...graph.nodes, ...graph.edges])
      expect(entity).toMatchObject({ createdBy: 'seed', createdAtBeat: 0 });
    expect(await store.getNode('fact:secret')).toMatchObject({
      name: 'secret',
      summary: 'The peer hid a ruby beneath the east stair.',
    });
    expect(
      await store.edges({ types: ['MEMBER_OF'], from: 'char:seller' }),
    ).toMatchObject([{ properties: { rank: 'merchant' } }]);
  });
  it('creates deterministic observations only for the stored witnesses', async () => {
    const store = await seededStore();
    const event = record(
      'ContainerOpened',
      { containerId: 'container:box', revealed: ['item:quest'] },
      { beat: 3, seq: 2, private: true, witnesses: ['char:player'] },
    );
    await store.apply(project(event));
    expect(await store.getNode('fact:observation-3-2')).toMatchObject({
      kind: 'observation',
      truth: true,
      statement: 'container:box was opened, revealing item:quest.',
      createdAtBeat: 3,
    });
    expect(
      await store.edges({ types: ['KNOWS'], to: 'fact:observation-3-2' }),
    ).toMatchObject([
      {
        from: 'char:player',
        properties: { since: 3, source: 'witnessed', confidence: 1 },
      },
    ]);
    expect(
      await store.edges({ types: ['ABOUT'], from: 'fact:observation-3-2' }),
    ).toHaveLength(2);
    await store.apply(
      project(
        record(
          'EntityRevealed',
          { entityId: 'item:secret' },
          { seq: 4, witnesses: [] },
        ),
      ),
    );
    expect(await store.getNode('fact:observation-1-4')).toMatchObject({
      statement: 'item:secret was revealed.',
    });
    expect(
      await store.edges({ types: ['KNOWS'], to: 'fact:observation-1-4' }),
    ).toEqual([]);
  });
  it('stores one-line event summaries, actual rolls and distinct involvement roles', async () => {
    const store = await seededStore();
    await store.apply(
      project(
        record(
          'AttackResolved',
          {
            attacker: 'char:player',
            target: 'char:player',
            weaponId: 'item:rock',
            roll: { expr: '1d20', rolls: [20], total: 20, outcome: 'success' },
            hit: true,
            critical: true,
          },
          { witnesses: ['char:peer'], private: true },
        ),
      ),
    );
    expect(await store.getNode('event:1-0')).toMatchObject({
      summary: 'char:player attacked char:player: hit (critical), roll 20.',
      private: true,
      roll: { total: 20 },
    });
    expect(
      (
        await store.edges({
          types: ['INVOLVES'],
          from: 'event:1-0',
          to: 'char:player',
        })
      ).map((edge) => edge.properties),
    ).toEqual([{ role: 'actor' }, { role: 'target' }]);
    expect(
      await store.edges({ types: ['INVOLVES'], to: 'item:rock' }),
    ).toMatchObject([{ properties: { role: 'item' } }]);
    expect(
      await store.edges({ types: ['WITNESSED'], to: 'event:1-0' }),
    ).toMatchObject([{ from: 'char:peer' }]);
    await store.apply(
      project(
        record(
          'NarrationCommitted',
          { text: 'First line.\n Second line.', lines: [], mood: 'calm' },
          { seq: 1 },
        ),
      ),
    );
    expect(await store.getNode('event:1-1')).toMatchObject({
      summary: 'First line. Second line.',
    });
  });
});
