import { expect, it } from 'vitest';
import { beatProgressPayloadSchema, serverMessageSchema } from './protocol.js';

it.each(['peers', 'dm', 'npc_voice', 'critic', 'dm_retry', 'committing'])(
  'accepts status phase %s with or without a cumulative count',
  (phase) => {
    for (const count of [{}, { toolCalls: 0 }, { toolCalls: 3 }]) {
      const progress = { kind: 'status', phase, ...count };
      expect(beatProgressPayloadSchema.parse(progress)).toEqual(progress);
      expect(
        serverMessageSchema.safeParse({
          type: 'beat_progress',
          beat: 1,
          progress,
        }).success,
      ).toBe(true);
    }
  },
);

it.each([-1, 1.5, '3', null, Infinity, NaN])(
  'rejects toolCalls=%s',
  (toolCalls) => {
    expect(
      beatProgressPayloadSchema.safeParse({
        kind: 'status',
        phase: 'dm',
        toolCalls,
      }).success,
    ).toBe(false);
  },
);

it.each([
  { kind: 'status' },
  { kind: 'status', phase: 'done' },
  { kind: 'status', phase: null },
  { phase: 'dm' },
])('requires a known phase and status discriminant: %j', (progress) => {
  expect(beatProgressPayloadSchema.safeParse(progress).success).toBe(false);
});

it.each([
  'tool',
  'toolName',
  'result',
  'roll',
  'rolls',
  'narration',
  'text',
  'events',
  'outcome',
  'speaker',
  'cue',
])('rejects extra status field %s', (field) => {
  expect(
    beatProgressPayloadSchema.safeParse({
      kind: 'status',
      phase: 'dm',
      [field]: 'secret outcome',
    }).success,
  ).toBe(false);
});
