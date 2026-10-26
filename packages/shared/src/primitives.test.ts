import { expect, test } from 'vitest';
import * as p from './primitives.js';
import { abilities, roll } from './testing/fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  ['beat', p.beatSchema, 0, -1],
  [
    'provenance creator',
    p.createdBySchema,
    'generator:feature',
    'generator:container',
  ],
  ['ability', p.abilitySchema, 'str', 'strength'],
  ['skill', p.skillSchema, 'sleight_of_hand', 'sleightOfHand'],
  ['abilities', p.abilitiesSchema, abilities, { ...abilities, dex: '15' }],
  ['DC', p.dcSchema, 15, 12],
  ['advantage', p.advantageSchema, 'none', 'normal'],
  ['role', p.characterRoleSchema, 'peer', 'companion'],
  ['rarity', p.raritySchema, 'very_rare', 'very rare'],
  ['item kind', p.itemKindSchema, 'tool', 'key'],
  ['location kind', p.locationKindSchema, 'room', 'region'],
  ['fact kind', p.factKindSchema, 'rumour', 'rumor'],
  ['fact truth', p.factTruthSchema, true, 'true'],
  ['quest kind', p.questKindSchema, 'personal', 'main'],
  ['quest status', p.questStatusSchema, 'complete', 'completed'],
  ['equipment slot', p.equipmentSlotSchema, 'main_hand', 'hand'],
  ['tile', p.tileSchema, { x: 0, y: 1 }, { x: '0', y: 1 }],
  [
    'tile bounds',
    p.tileBoundsSchema,
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 0, y: 0, w: 0, h: 1 },
  ],
  ['confidence', p.confidenceSchema, 0.6, 1.5],
  ['attitude', p.attitudeValueSchema, -100, 150],
  ['knowledge source', p.knowledgeSourceSchema, 'witnessed', 'heard'],
  ['transfer reason', p.transferReasonSchema, 'pick_up', 'pickup'],
  ['unlock method', p.unlockMethodSchema, 'lockpick', 'pick'],
  ['combat end reason', p.combatEndReasonSchema, 'talked_down', 'finished'],
  [
    'holder',
    p.holderSchema,
    { kind: 'character', id: 'char:brann' },
    { kind: 'container', id: 'char:brann' },
  ],
  ['holder id', p.holderIdSchema, 'container:box', 'item:key'],
  ['heal source', p.healSourceSchema, 'rest', 'spell'],
  [
    'heal source check receipt',
    p.healSourceSchema,
    { checkId: 'chk_12a' },
    { checkId: '' },
  ],
  ['roll outcome', p.rollOutcomeSchema, 'tie', 'win'],
  ['roll', p.rollSchema, roll, { ...roll, total: '15' }],
  ['event type', p.eventTypeSchema, 'RecapUpdated', 'ItemPickedUp'],
]);
test.each([5, 10, 15, 20, 25])('DC accepts the fixed scale value %i', (dc) => {
  expect(p.dcSchema.safeParse(dc).success).toBe(true);
});
test.each([2, 21, 3.5])(
  'abilities reject out-of-range or fractional score %s',
  (str) => {
    expect(p.abilitiesSchema.safeParse({ ...abilities, str }).success).toBe(
      false,
    );
  },
);
test.each([3, 20])('abilities accept endpoint %i', (str) => {
  expect(p.abilitiesSchema.safeParse({ ...abilities, str }).success).toBe(true);
});
test.each([false, 'unknown'])('fact truth accepts %s', (truth) => {
  expect(p.factTruthSchema.safeParse(truth).success).toBe(true);
});
test.each([0, 1])('confidence accepts endpoint %s', (confidence) => {
  expect(p.confidenceSchema.safeParse(confidence).success).toBe(true);
});
test('confidence rejects negative values', () => {
  expect(p.confidenceSchema.safeParse(-0.1).success).toBe(false);
});
test('rolls accept an AC outside the fixed skill DC scale', () => {
  expect(p.rollSchema.safeParse({ ...roll, dc: 13 }).success).toBe(true);
});
test('rolls reject null for an optional DC', () => {
  expect(p.rollSchema.safeParse({ ...roll, dc: null }).success).toBe(false);
});
