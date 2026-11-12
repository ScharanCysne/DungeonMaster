import { expect, test } from 'vitest';
import type { ReplayState } from '@dungeon/shared';
import { applyServerMessage } from './reducer';
import { createInitialState } from './types';
import { event, freeze, result, snapshot } from '../testing/fixtures';
import { debugGraph, debugTrace } from '../testing/dev';

test('a backward seek atomically replaces world, journal, inventory metadata and developer caches', () => {
  let state = applyServerMessage(createInitialState(), snapshot);
  state = applyServerMessage(state, {
    type: 'replay_info',
    sessionId: 'run',
    beats: 3,
    ended: false,
  });
  state = applyServerMessage(state, result([], 3));
  state = applyServerMessage(state, {
    type: 'debug_response',
    kind: 'graph',
    data: debugGraph,
  });
  state = applyServerMessage(state, {
    type: 'debug_response',
    kind: 'trace',
    data: debugTrace,
  });
  state.world.equipped = ['item:rope'];
  state.world.acquiredAt = { 'item:rope': 3 };
  state.selection.ids = ['item:rope'];
  state.composer.text = 'future draft';
  const next = applyServerMessage(freeze(state), {
    type: 'replay_state',
    snapshot,
    results: [],
    groundTruth: { nodes: [], edges: [] },
  });
  expect(next.world.beat).toBe(0);
  expect(next.world.entities).toEqual(
    Object.fromEntries(snapshot.entities.map((node) => [node.id, node])),
  );
  expect(next.world.inventory).toEqual(snapshot.inventory);
  expect(next.world.equipped).toEqual([]);
  expect(next.world.acquiredAt).toEqual({});
  expect(next.journal.entries).toEqual([]);
  expect(next.connection.lastSeenBeat).toBe(0);
  expect(next.dev).toMatchObject({
    traces: {},
    knowledge: {},
    graph: null,
    groundTruth: { nodes: [], edges: [] },
  });
  expect(next.selection.ids).toEqual([]);
  expect(next.composer.text).toBe('');
  expect(next.replay?.beats).toBe(3);
});

test('replay preserves authoritative snapshot HP/gold and reconstructs inventory badges without animations', () => {
  const transfer = event('ItemTransferred', {
    itemId: 'item:quill',
    from: { kind: 'container', id: 'container:box' },
    to: { kind: 'character', id: 'char:player' },
    reason: 'pick_up',
    goldChanges: [],
  });
  const message: ReplayState = {
    type: 'replay_state',
    snapshot: { ...snapshot, beat: 1, gold: 7, inventory: ['item:quill'] },
    results: [result([transfer])],
    ended: {
      type: 'episode_ended',
      beat: 1,
      holder: 'char:player',
      summary: 'A quiet victory.',
    },
  };
  const next = applyServerMessage(freeze(createInitialState()), message);
  expect(next.world.gold).toBe(7);
  expect(next.world.inventory).toEqual(['item:quill']);
  expect(next.world.acquiredAt).toEqual({ 'item:quill': 1 });
  expect(next.journal.reveal).toBeNull();
  expect(next.journal.entries.at(-1)).toMatchObject({
    kind: 'episode_end',
    text: 'A quiet victory.',
  });
  expect(next.beat.status).toBe('ended');
  expect(next.results).toEqual(message.results);
});

test('a session reset removes end/replay state and permits beat one in the fresh session', () => {
  let state = applyServerMessage(createInitialState(), snapshot);
  state = applyServerMessage(state, result([], 3));
  state = applyServerMessage(state, {
    type: 'episode_ended',
    beat: 3,
    holder: 'char:player',
    summary: 'Done.',
  });
  state = applyServerMessage(state, {
    type: 'session_reset',
    sessionId: 'fresh',
  });
  state = applyServerMessage(state, snapshot);
  expect(state.beat.status).toBe('idle');
  expect(state.connection.lastSeenBeat).toBe(0);
  expect(state.replay).toBeNull();
  expect(state.journal.entries).toEqual([]);
  expect(applyServerMessage(state, result()).connection.lastSeenBeat).toBe(1);
});
