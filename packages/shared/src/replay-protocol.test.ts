import { expect, test } from 'vitest';
import { clientMessageSchema, serverMessageSchema } from './protocol.js';
import { serverMessages } from './testing/protocol-fixtures.js';

const replay = {
  type: 'replay_state',
  snapshot: serverMessages.world_snapshot,
  results: [serverMessages.beat_result],
  ended: serverMessages.episode_ended,
};
test.each([
  { type: 'replay_seek', beat: 0 },
  { type: 'session_command', command: 'replay_session' },
  { type: 'session_command', command: 'start_new_run' },
])('accepts client lifecycle message %j', (message) => {
  expect(clientMessageSchema.parse(message)).toEqual(message);
});
test.each([
  { type: 'replay_info', sessionId: 'run', beats: 30, ended: true },
  replay,
  { ...replay, ended: undefined, groundTruth: { nodes: [], edges: [] } },
  { type: 'session_reset', sessionId: 'new' },
  { type: 'session_saved', sessionId: 'old', beat: 3 },
  {
    ...serverMessages.paused,
    budgetStepUsd: 2.5,
    errorCode: 'OFFLINE',
    traceId: 'beat-1-0',
  },
])('accepts server lifecycle message %j', (message) => {
  expect(serverMessageSchema.parse(message)).toEqual(message);
});
test.each([-1, 1.5, '1', null])('rejects invalid seek beat %j', (beat) => {
  expect(
    clientMessageSchema.safeParse({ type: 'replay_seek', beat }).success,
  ).toBe(false);
});
test.each([
  { ...replay, extra: true },
  { ...replay, snapshot: { ...replay.snapshot, hidden: [] } },
  { ...replay, results: [{ ...serverMessages.beat_result, extra: true }] },
  { ...replay, groundTruth: null },
  { type: 'replay_info', sessionId: '', beats: 0, ended: false },
  { type: 'replay_info', sessionId: 'run', beats: -1, ended: false },
  { ...serverMessages.paused, budgetStepUsd: -5 },
  { ...serverMessages.paused, budgetStepUsd: 0 },
])('rejects invalid lifecycle message %j', (message) => {
  expect(serverMessageSchema.safeParse(message).success).toBe(false);
});
