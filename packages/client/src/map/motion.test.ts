import { expect, test } from 'vitest';
import { sampleCue, sampleMoves } from './motion';
import type { MapTween, RenderCue } from './renderModel';

const moves: MapTween[] = [
  {
    key: '1:1',
    id: 'char:player',
    path: [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ],
    startMs: 0,
    durationMs: 250,
  },
  {
    key: '1:2',
    id: 'char:ilsa',
    path: [
      { x: 4, y: 1 },
      { x: 3, y: 1 },
    ],
    startMs: 250,
    durationMs: 125,
  },
  {
    key: '1:3',
    id: 'char:player',
    path: [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ],
    startMs: 375,
    durationMs: 125,
  },
];
test('follows corners without cutting across the exact engine path', () => {
  expect(sampleMoves(moves, 0).get('char:player')).toEqual({ x: 1, y: 1 });
  expect(sampleMoves(moves, 62.5).get('char:player')).toEqual({ x: 1.5, y: 1 });
  expect(sampleMoves(moves, 125).get('char:player')).toEqual({ x: 2, y: 1 });
  expect(sampleMoves(moves, 187.5).get('char:player')).toEqual({
    x: 2,
    y: 1.5,
  });
});
test('other movers wait their turn, including repeated moves by the same entity', () => {
  expect(sampleMoves(moves, 100).get('char:ilsa')).toEqual({ x: 4, y: 1 });
  expect(sampleMoves(moves, 312.5).get('char:ilsa')).toEqual({ x: 3.5, y: 1 });
  expect(sampleMoves(moves, 312.5).get('char:player')).toEqual({ x: 2, y: 2 });
  expect(sampleMoves(moves, 437.5).get('char:player')).toEqual({
    x: 2.5,
    y: 2,
  });
  expect(sampleMoves(moves, 10000).get('char:player')).toEqual({ x: 3, y: 2 });
});
test('zero-duration movement snaps all entities to their final destinations', () => {
  const snap = moves.map((move) => ({ ...move, startMs: 0, durationMs: 0 }));
  expect([...sampleMoves(snap, 0)]).toEqual([
    ['char:player', { x: 3, y: 2 }],
    ['char:ilsa', { x: 3, y: 1 }],
  ]);
});
test.each(['turn', 'look_at'] as const)(
  '%s briefly faces the target without moving',
  (kind) => {
    const cue: RenderCue = { key: '1:1', id: 'char:ilsa', kind, flipX: true };
    expect(sampleCue(cue, 100)).toEqual({ y: 0, flipX: true });
    expect(sampleCue(cue, 240)).toEqual({ y: 0, flipX: false });
  },
);
test('glance and targetless turn hop exactly one pixel then settle', () => {
  for (const kind of ['glance_up', 'turn', 'look_at'] as const) {
    const cue: RenderCue = { key: '1:1', id: 'char:ilsa', kind, flipX: null };
    expect(sampleCue(cue, 0).y).toBe(0);
    expect(sampleCue(cue, 100).y).toBe(-1);
    expect(sampleCue(cue, 240).y).toBe(0);
  }
});
