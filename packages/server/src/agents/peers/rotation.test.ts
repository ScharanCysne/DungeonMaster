import { expect, it } from 'vitest';
import type { CharacterId } from '@dungeon/shared';
import { initialRotation, recordPeerTurns, rotatePeers } from './rotation.js';

const peers: { id: CharacterId; name: string }[] = [
  { id: 'char:ilsa', name: 'Ilsa Quickfingers' },
  { id: 'char:doran', name: 'Doran Ashby' },
  { id: 'char:mael', name: 'Sister Mael' },
];
const player = { selection: [], text: 'I look around.' };

it('rotates at most two peers in stable ID order independent of roster order', () => {
  let state = initialRotation();
  const turns = [];
  for (let beat = 0; beat < 3; beat++) {
    const result = rotatePeers(peers, player, state);
    turns.push(result.selected);
    state = result.state;
  }
  expect(turns).toEqual([
    ['char:doran', 'char:ilsa'],
    ['char:mael', 'char:doran'],
    ['char:ilsa', 'char:mael'],
  ]);
  expect(rotatePeers([...peers].reverse(), player, initialRotation())).toEqual(
    rotatePeers(peers, player, initialRotation()),
  );
});

it('prioritizes names and selections, then pending, then round robin', () => {
  const state = {
    ...initialRotation(),
    pending: ['char:ilsa'] as CharacterId[],
  };
  expect(
    rotatePeers(peers, { selection: [], text: 'MAEL, help me.' }, state)
      .selected,
  ).toEqual(['char:mael', 'char:ilsa']);
  expect(
    rotatePeers(
      peers,
      { selection: ['char:mael'], text: 'Doran, wait.' },
      state,
    ).selected,
  ).toEqual(['char:doran', 'char:mael']);
  expect(rotatePeers(peers, player, state).selected).toEqual([
    'char:ilsa',
    'char:doran',
  ]);
});

it('matches whole name words, ignores titles, deduplicates and caps priority peers', () => {
  expect(
    rotatePeers(
      peers,
      { selection: ['char:mael'], text: 'Mael, Ilsa and Doran.' },
      initialRotation(),
    ).selected,
  ).toEqual(['char:doran', 'char:ilsa']);
  expect(
    rotatePeers(
      peers,
      { selection: [], text: 'maelstrom sister' },
      initialRotation(),
    ).selected,
  ).toEqual(['char:doran', 'char:ilsa']);
});

it('priority selections do not starve the round-robin cursor', () => {
  let state = initialRotation();
  const chosen = [];
  for (let beat = 0; beat < 3; beat++) {
    const result = rotatePeers(
      peers,
      { selection: ['char:mael'], text: '' },
      state,
    );
    chosen.push(result.selected);
    state = result.state;
  }
  expect(chosen).toEqual([
    ['char:mael', 'char:doran'],
    ['char:mael', 'char:ilsa'],
    ['char:mael', 'char:doran'],
  ]);
});

it('handles empty, single and changed rosters without mutating state', () => {
  const state = { ...initialRotation(), nextPeer: 'char:gone' as const };
  expect(rotatePeers([], player, state).selected).toEqual([]);
  expect(rotatePeers(peers.slice(0, 1), player, state).selected).toEqual([
    'char:ilsa',
  ]);
  expect(state.nextPeer).toBe('char:gone');
});

it('counts offered passes, resets on intent, and persists only explicit unresolved actions', () => {
  let state = initialRotation();
  for (let i = 0; i < 3; i++)
    state = recordPeerTurns(
      state,
      [{ actor: 'char:ilsa', turn: { kind: 'pass' } }],
      [],
    );
  expect(state.consecutivePasses).toEqual({ 'char:ilsa': 3 });
  const next = recordPeerTurns(
    state,
    [{ actor: 'char:doran', turn: { kind: 'pass' } }],
    ['char:ilsa', 'char:ilsa'],
  );
  expect(next.consecutivePasses['char:ilsa']).toBe(3);
  expect(next.pending).toEqual(['char:ilsa']);
  const reset = recordPeerTurns(
    next,
    [
      {
        actor: 'char:ilsa',
        turn: { kind: 'intent', text: 'I wait.', refs: [], private: false },
      },
    ],
    [],
  );
  expect(reset.consecutivePasses['char:ilsa']).toBe(0);
  expect(state.consecutivePasses['char:ilsa']).toBe(3);
  expect(JSON.parse(JSON.stringify(reset))).toEqual(reset);
});
