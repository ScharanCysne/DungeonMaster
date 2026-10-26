import { expect, test } from 'vitest';
import * as p from './protocol.js';
import { without } from './testing/fixtures.js';
import {
  clientMessages as client,
  serverMessages as server,
} from './testing/protocol-fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  ['hello', p.helloSchema, client.hello, without(client.hello, 'episodeId')],
  [
    'player intent',
    p.playerIntentSchema,
    client.player_intent,
    without(client.player_intent, 'text'),
  ],
  [
    'debug request',
    p.debugRequestSchema,
    client.debug_request,
    { ...client.debug_request, kind: 'state' },
  ],
  [
    'session command',
    p.sessionCommandSchema,
    client.session_command,
    { ...client.session_command, command: 'retry' },
  ],
  [
    'client union',
    p.clientMessageSchema,
    client.player_intent,
    server.beat_started,
  ],
  [
    'world snapshot',
    p.worldSnapshotSchema,
    server.world_snapshot,
    without(server.world_snapshot, 'entities'),
  ],
  [
    'beat started',
    p.beatStartedSchema,
    server.beat_started,
    { ...server.beat_started, beat: '1' },
  ],
  [
    'beat result',
    p.beatResultSchema,
    server.beat_result,
    without(server.beat_result, 'narration'),
  ],
  [
    'episode ended',
    p.episodeEndedSchema,
    server.episode_ended,
    { ...server.episode_ended, holder: 'Brann' },
  ],
  [
    'debug response',
    p.debugResponseSchema,
    server.debug_graph,
    { ...server.debug_graph, kind: 'trace' },
  ],
  [
    'error',
    p.errorMessageSchema,
    server.error,
    without(server.error, 'message'),
  ],
  ['pause reason', p.pauseReasonSchema, 'budget', 'timeout'],
  [
    'paused',
    p.pausedSchema,
    server.paused,
    { ...server.paused, retryInMs: -1 },
  ],
  ['resumed', p.resumedSchema, server.resumed, without(server.resumed, 'beat')],
  [
    'server union',
    p.serverMessageSchema,
    server.beat_result,
    client.player_intent,
  ],
]);
for (const [name, sample] of Object.entries(client)) {
  test(`client union accepts ${name}`, () => {
    expect(p.clientMessageSchema.safeParse(sample).success).toBe(true);
  });
}
for (const [name, sample] of Object.entries(server)) {
  test(`server union accepts ${name}`, () => {
    expect(p.serverMessageSchema.safeParse(sample).success).toBe(true);
  });
  test(`server union rejects a missing type for ${name}`, () => {
    expect(
      p.serverMessageSchema.safeParse(without(sample, 'type')).success,
    ).toBe(false);
  });
}
test('player intent accepts six selections', () => {
  expect(
    p.playerIntentSchema.safeParse({
      type: 'player_intent',
      selection: Array.from({ length: 6 }, (_, i) => `item:key-${i}`),
      text: 'Look at these keys.',
    }).success,
  ).toBe(true);
});
test('player intent accepts 500 characters', () => {
  expect(
    p.playerIntentSchema.safeParse({
      ...client.player_intent,
      text: 'a'.repeat(500),
    }).success,
  ).toBe(true);
});
test('player intent rejects seven selected entities', () => {
  expect(
    p.playerIntentSchema.safeParse({
      ...client.player_intent,
      selection: Array.from({ length: 7 }, (_, i) => `item:key-${i}`),
    }).success,
  ).toBe(false);
});
test('player intent rejects 501 characters', () => {
  expect(
    p.playerIntentSchema.safeParse({
      ...client.player_intent,
      text: 'a'.repeat(501),
    }).success,
  ).toBe(false);
});
test('player intent accepts text without a selection', () => {
  expect(
    p.playerIntentSchema.safeParse({ ...client.player_intent, selection: [] })
      .success,
  ).toBe(true);
});
test('player intent rejects a misspelled selection field', () => {
  expect(
    p.playerIntentSchema.safeParse({
      ...without(client.player_intent, 'selection'),
      selections: ['container:box'],
    }).success,
  ).toBe(false);
});
test('hello accepts a last-seen beat for reconnects', () => {
  expect(
    p.helloSchema.safeParse({ ...client.hello, lastSeenBeat: 3 }).success,
  ).toBe(true);
});
test('debug_request rejects a null optional target', () => {
  expect(
    p.debugRequestSchema.safeParse({ ...client.debug_request, target: null })
      .success,
  ).toBe(false);
});
test.each(p.pauseReasonSchema.options)(
  'paused accepts reason %s without an automatic retry',
  (reason) => {
    expect(
      p.pausedSchema.safeParse({ ...server.paused, reason, retryInMs: null })
        .success,
    ).toBe(true);
  },
);
test('beat_result validates the optional ground truth graph', () => {
  expect(
    p.beatResultSchema.safeParse({
      ...server.beat_result,
      groundTruth: { nodes: [], edges: [] },
    }).success,
  ).toBe(true);
});
