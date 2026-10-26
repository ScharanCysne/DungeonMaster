import { expect, expectTypeOf, test } from 'vitest';
import { eventPayloadSchemas, gameEventSchema } from './events.js';
import type { GameEventOf } from './events.js';
import { characterIdSchema } from './ids.js';
import type { CharacterId } from './ids.js';
import { passTurnInputSchema, toolSchemas } from './tools.js';
import { envelope } from './testing/fixtures.js';
import { eventPayloads } from './testing/event-fixtures.js';

test.each([
  { combatant: 'item:quill' },
  { combatant: null },
  { round: 0 },
  { round: 1.5 },
  { turn: -1 },
  { turn: '1' },
  { extra: true },
])('TurnAdvanced rejects invalid payload fields %j', (override) => {
  expect(
    gameEventSchema.safeParse({
      ...envelope,
      type: 'TurnAdvanced',
      payload: { ...eventPayloads.TurnAdvanced, ...override },
    }).success,
  ).toBe(false);
});

test('TurnAdvanced retains the character id type', () => {
  expectTypeOf<
    GameEventOf<'TurnAdvanced'>['payload']['combatant']
  >().toEqualTypeOf<CharacterId>();
});

test.each(['item:quill', null, '', 1])(
  'pass_turn rejects a non-character actor %s',
  (actor) => {
    expect(passTurnInputSchema.safeParse({ actor }).success).toBe(false);
  },
);

test('pass_turn is registered with its exported input schema and turn event output', () => {
  expect(toolSchemas.pass_turn.input).toBe(passTurnInputSchema);
  expect(toolSchemas.pass_turn.output).toBe(eventPayloadSchemas.TurnAdvanced);
  expect(
    passTurnInputSchema.parse({
      actor: characterIdSchema.parse('char:player'),
    }),
  ).toEqual({ actor: 'char:player' });
});

test('DamageApplied represents fixed unarmed damage without inventing a die roll', () => {
  expect(
    eventPayloadSchemas.DamageApplied.safeParse({
      ...eventPayloads.DamageApplied,
      amount: 1,
      roll: { expr: '1-4', rolls: [], total: -3, outcome: 'success' },
    }).success,
  ).toBe(true);
});
