import { expect, it } from 'vitest';
import type { BeatResult, Graph } from '@dungeon/shared';
import { harness, narration } from '../beat/testing/harness.js';
import { envelopeDrafts } from '../ontology/eventLog.js';
import { debugNode } from '../ontology/projectionHelpers.js';
import { playerPerspective } from './perspective.js';

async function context() {
  const { session, store } = await harness();
  const knowledge = await session.knowledge();
  const graph: Graph = {
    nodes: (await store.nodes()).map(debugNode),
    edges: await store.edges(),
  };
  return { knowledge, graph, view: playerPerspective(knowledge, graph) };
}

it('keeps only self, visible entities and inventory in snapshots without mutating inputs', async () => {
  const { knowledge, graph, view } = await context();
  const before = structuredClone({ knowledge, graph });
  const result = view.snapshot({
    beat: 0,
    mapId: 'tavern',
    positions: [
      {
        entityId: 'char:kael',
        locationId: 'loc:common-room',
        tile: { x: 12, y: 10 },
      },
      {
        entityId: 'container:old-barrel',
        locationId: 'loc:kitchen',
        tile: { x: 22, y: 13 },
      },
    ],
    recentNarration: [],
  });
  expect(new Set(result.entities.map(({ id }) => id))).toEqual(
    new Set([
      knowledge.character.id,
      ...knowledge.visible.map(({ id }) => id),
      ...knowledge.inventory.map(({ id }) => id),
    ]),
  );
  expect(result.positions).toHaveLength(1);
  expect(result.inventory).toEqual(knowledge.inventory.map(({ id }) => id));
  expect(result.gold).toBe(knowledge.character.gold);
  expect(
    result.entities.find(({ id }) => id === 'char:stranger'),
  ).toMatchObject({
    background: '',
    personality: '',
    summary:
      'Charcoal hood, grey gloves, a hard glint of metal beneath one cuff.',
  });
  expect({ knowledge, graph }).toEqual(before);
});

it('removes hidden container references from a carried key', async () => {
  const { knowledge, graph } = await context();
  const key = graph.nodes.find((node) => node.id === 'item:iron-key');
  if (!key || !('properties' in key)) throw new Error('Missing key');
  knowledge.inventory.push(key);
  const snapshot = playerPerspective(knowledge, graph).snapshot({
    beat: 0,
    mapId: 'tavern',
    positions: [],
    recentNarration: [],
  });
  expect(snapshot.inventory).toContain(key.id);
  expect(JSON.stringify(snapshot)).not.toContain('container:old-barrel');
});

it('filters unknown facts, private peer intentions, hidden witnesses and unwitnessed rolls', async () => {
  const { view } = await context();
  const events = envelopeDrafts(
    [
      {
        type: 'IntentReceived',
        actor: 'char:ilsa',
        private: true,
        witnesses: ['char:kael'],
        payload: { text: 'My secret plan.', selection: [] },
      },
      {
        type: 'IntentReceived',
        actor: 'char:ilsa',
        private: false,
        witnesses: ['char:kael', 'char:marta'],
        payload: {
          text: 'My secret plan.',
          say: 'Hello.',
          selection: ['container:old-barrel'],
        },
      },
      {
        type: 'FactLearned',
        actor: 'char:ilsa',
        private: false,
        witnesses: ['char:kael'],
        payload: {
          characterId: 'char:ilsa',
          factId: 'fact:ilsa-debt',
          since: 1,
          source: 'told',
          confidence: 1,
        },
      },
      {
        type: 'EntityRevealed',
        actor: 'char:ilsa',
        private: false,
        witnesses: ['char:ilsa'],
        payload: { entityId: 'item:quill' },
      },
    ],
    { sessionId: 'filter', beat: 1, traceId: 'beat-1-0', createdBy: 'engine' },
  );
  const input: BeatResult = {
    type: 'beat_result',
    beat: 1,
    events,
    narration,
    rolls: [
      { expr: '1d20', rolls: [20], total: 20, dc: 10, outcome: 'success' },
    ],
    traceId: 'beat-1-0',
  };
  const filtered = view.result(input, false);
  expect(filtered.events).toHaveLength(1);
  expect(filtered.events[0]).toMatchObject({
    witnesses: ['char:kael'],
    payload: { text: 'Hello.', selection: [], say: 'Hello.' },
  });
  expect(filtered.rolls).toEqual([]);
  expect(filtered).not.toHaveProperty('groundTruth');
});

it('filters provisional lines, cues and narration before any browser delivery', async () => {
  const { view, graph } = await context();
  const secret = graph.nodes.find((node) => node.id === 'fact:ilsa-debt');
  if (!secret || !('statement' in secret)) throw new Error('Missing secret');
  expect(
    view.message({
      type: 'beat_progress',
      beat: 1,
      progress: {
        kind: 'peer_line',
        speaker: 'char:ilsa',
        text: secret.statement,
      },
    }),
  ).toBeUndefined();
  expect(
    view.message({
      type: 'beat_progress',
      beat: 1,
      progress: {
        kind: 'map_cue',
        entity: 'char:ilsa',
        cue: 'look_at',
        target: 'container:old-barrel',
      },
    }),
  ).toBeUndefined();
  const cue = {
    type: 'beat_progress',
    beat: 1,
    progress: {
      kind: 'map_cue',
      entity: 'char:kael',
      cue: 'look_at',
      target: 'char:brann',
    },
  } as const;
  expect(view.message(cue)).toEqual(cue);
  const snapshot = view.snapshot({
    beat: 1,
    mapId: 'tavern',
    positions: [],
    recentNarration: [
      {
        text: secret.statement,
        lines: [{ speaker: 'char:ilsa', text: secret.statement }],
      },
    ],
  });
  expect(snapshot.recentNarration).toEqual([
    { text: 'You notice no further change.', lines: [] },
  ]);
});
