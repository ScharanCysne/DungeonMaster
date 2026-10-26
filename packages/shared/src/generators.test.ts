import { expect, test } from 'vitest';
import * as g from './tools/generated.js';
import * as f from './testing/fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  [
    'generated fact',
    g.generatedFactSchema,
    f.generatedFact,
    { ...f.generatedFact, truth: 'true' },
  ],
  [
    'generated item content',
    g.generatedItemContentSchema,
    f.generatedItem.item,
    { ...f.generatedItem.item, value: '500' },
  ],
  [
    'generated item',
    g.generatedItemSchema,
    f.generatedItem,
    { ...f.generatedItem, backstory: [] },
  ],
  [
    'generated NPC content',
    g.generatedNpcContentSchema,
    f.generatedNpc.npc,
    { ...f.generatedNpc.npc, role: 'peer' },
  ],
  [
    'generated attitude',
    g.generatedAttitudeSchema,
    { to: 'char:player', value: 0, reason: 'Neutral.' },
    { to: 'char:player', value: '0', reason: 'Neutral.' },
  ],
  [
    'generated NPC',
    g.generatedNpcSchema,
    f.generatedNpc,
    f.without(f.generatedNpc, 'secret'),
  ],
  [
    'generated feature',
    g.generatedFeatureSchema,
    f.generatedFeature,
    { ...f.generatedFeature, opened: true },
  ],
  ['generated story', g.generatedStorySchema, f.generatedStory, { facts: [] }],
]);
test('generated item leaves rarity and value policy to config validation', () => {
  expect(
    g.generatedItemSchema.safeParse({
      ...f.generatedItem,
      item: { ...f.generatedItem.item, rarity: 'legendary', value: 50_000 },
    }).success,
  ).toBe(true);
});
test('generated NPC leaves numeric policy bounds to config validation', () => {
  expect(
    g.generatedNpcSchema.safeParse({
      ...f.generatedNpc,
      npc: {
        ...f.generatedNpc.npc,
        abilities: { ...f.abilities, str: 99 },
        hp: 200,
        maxHp: 200,
        ac: 40,
      },
    }).success,
  ).toBe(true);
});
test('generated feature leaves DC policy to registration', () => {
  expect(
    g.generatedFeatureSchema.safeParse({
      ...f.generatedFeature,
      findDc: 12,
      lockDc: 90,
    }).success,
  ).toBe(true);
});
test('generated item rejects a model-supplied questCritical flag', () => {
  expect(
    g.generatedItemSchema.safeParse({
      ...f.generatedItem,
      item: { ...f.generatedItem.item, questCritical: true },
    }).success,
  ).toBe(false);
});
test('generated item rejects more than two backstory facts', () => {
  expect(
    g.generatedItemSchema.safeParse({
      ...f.generatedItem,
      backstory: Array.from({ length: 3 }, () => f.generatedFact),
    }).success,
  ).toBe(false);
});
test('generated NPC requires a secret kind for its secret', () => {
  expect(
    g.generatedNpcSchema.safeParse({
      ...f.generatedNpc,
      secret: f.generatedFact,
    }).success,
  ).toBe(false);
});
test('generated NPC rejects malformed optional starting items', () => {
  expect(
    g.generatedNpcSchema.safeParse({ ...f.generatedNpc, startingItems: null })
      .success,
  ).toBe(false);
});
test('generated features cannot supply contents', () => {
  expect(
    g.generatedFeatureSchema.safeParse({
      ...f.generatedFeature,
      contents: ['item:quill'],
    }).success,
  ).toBe(false);
});
test('generated story rejects more than three facts', () => {
  expect(
    g.generatedStorySchema.safeParse({
      facts: Array.from({ length: 4 }, () => f.generatedFact),
    }).success,
  ).toBe(false);
});
test('generated story rejects a secret kind', () => {
  expect(
    g.generatedStorySchema.safeParse({
      facts: [{ ...f.generatedFact, kind: 'secret' }],
    }).success,
  ).toBe(false);
});
