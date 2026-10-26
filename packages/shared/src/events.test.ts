import { expect, expectTypeOf, test } from 'vitest';
import {
  checkRolledPayloadSchema,
  goldChangeSchema,
  positionSchema,
} from './event-payloads.js';
import {
  eventEnvelopeSchema,
  eventPayloadSchemas,
  gameEventSchema,
} from './events.js';
import type { GameEventOf } from './events.js';
import { eventTypeSchema } from './primitives.js';
import type { Tile } from './primitives.js';
import { envelope, roll, without } from './testing/fixtures.js';
import { eventPayloads, movedEvent } from './testing/event-fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  ['event envelope', eventEnvelopeSchema, envelope, { ...envelope, v: 2 }],
  [
    'event union',
    gameEventSchema,
    movedEvent,
    { ...movedEvent, payload: { containerId: 'container:box', revealed: [] } },
  ],
  [
    'position',
    positionSchema,
    { locationId: 'loc:room', tile: { x: 1, y: 1 } },
    { locationId: 'loc:room' },
  ],
  [
    'gold change',
    goldChangeSchema,
    { characterId: 'char:player', gold: 5 },
    { characterId: 'char:player', gold: -1 },
  ],
  [
    'check payload',
    checkRolledPayloadSchema,
    eventPayloads.CheckRolled,
    { ...eventPayloads.CheckRolled, dc: 12 },
  ],
]);
for (const type of eventTypeSchema.options) {
  const payload = eventPayloads[type];
  const schema = eventPayloadSchemas[type];
  test(`${type} accepts a complete payload`, () => {
    expect(schema.safeParse(payload).success).toBe(true);
  });
  test(`${type} rejects an incomplete or misspelled payload`, () => {
    const key = Object.keys(payload)[0];
    expect(
      schema.safeParse(
        key === undefined ? { commited: true } : without(payload, key),
      ).success,
    ).toBe(false);
  });
  test(`event union accepts ${type}`, () => {
    expect(
      gameEventSchema.safeParse({ ...envelope, type, payload }).success,
    ).toBe(true);
  });
  test(`${type} requires the log session id`, () => {
    expect(
      gameEventSchema.safeParse(
        without({ ...envelope, type, payload }, 'sessionId'),
      ).success,
    ).toBe(false);
  });
}
test('event discriminants retain the corresponding payload type', () => {
  expectTypeOf<GameEventOf<'EntityMoved'>['payload']['path']>().toEqualTypeOf<
    Tile[]
  >();
});
test('CheckRolled preserves both opposed rolls and a tied winner', () => {
  expect(
    checkRolledPayloadSchema.safeParse({
      kind: 'contested',
      checkId: 'check:1-2',
      actor: 'char:player',
      skill: 'deception',
      target: 'char:brann',
      targetSkill: 'insight',
      reason: 'Bluff.',
      actorRoll: roll,
      targetRoll: roll,
      winner: null,
    }).success,
  ).toBe(true);
});
test('EntityMoved rejects a path containing string coordinates', () => {
  expect(
    eventPayloadSchemas.EntityMoved.safeParse({
      ...eventPayloads.EntityMoved,
      path: [{ x: '2', y: 1 }],
    }).success,
  ).toBe(false);
});
test('system events allow an explicit null actor', () => {
  expect(
    gameEventSchema.safeParse({
      ...envelope,
      actor: null,
      type: 'BeatCommitted',
      payload: {},
    }).success,
  ).toBe(true);
});
test('event envelopes reject string beat numbers', () => {
  expect(
    eventEnvelopeSchema.safeParse({ ...envelope, beat: '1' }).success,
  ).toBe(false);
});
test('event envelopes require witnesses', () => {
  expect(
    eventEnvelopeSchema.safeParse(without(envelope, 'witnesses')).success,
  ).toBe(false);
});
