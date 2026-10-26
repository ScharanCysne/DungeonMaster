import { expect, test } from 'vitest';
import * as o from './ontology.js';
import * as f from './testing/fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

const nodes = [
  ['Character', o.characterSchema, f.character],
  ['Item', o.itemSchema, f.item],
  ['Location', o.locationSchema, f.location],
  ['Container', o.containerSchema, f.container],
  ['Faction', o.factionSchema, f.faction],
  ['Quest', o.questSchema, f.quest],
  ['Fact', o.factSchema, f.fact],
  ['Event', o.eventNodeSchema, f.eventNode],
] as const;
schemaCases([
  ['provenance', o.provenanceSchema, f.provenance, { createdBy: 'seed' }],
  [
    'common node',
    o.commonNodeSchema,
    { ...f.metadata, ...f.provenance, id: 'char:brann' },
    f.metadata,
  ],
  ['node union', o.nodeSchema, f.item, { ...f.item, id: 'loc:quill' }],
  ...nodes.map(
    ([name, schema, sample]) =>
      [name, schema, sample, f.without(sample, 'id')] as const,
  ),
]);
for (const [name, schema, sample] of nodes) {
  test(`${name} rejects missing provenance`, () => {
    expect(schema.safeParse(f.without(sample, 'createdAtBeat')).success).toBe(
      false,
    );
  });
  test(`node union accepts ${name}`, () => {
    expect(o.nodeSchema.safeParse(sample).success).toBe(true);
  });
}
test.each([
  ['role', { role: 'companion' }],
  ['skill', { proficiencies: ['sleight of hand'] }],
  ['gold', { gold: -1 }],
  ['string HP', { hp: '12' }],
  ['fractional AC', { ac: 12.5 }],
])('Character rejects invalid %s', (_name, change) => {
  expect(
    o.characterSchema.safeParse({ ...f.character, ...change }).success,
  ).toBe(false);
});
test('Character requires gold', () => {
  expect(
    o.characterSchema.safeParse(f.without(f.character, 'gold')).success,
  ).toBe(false);
});
test.each([12, null, '15'])('Item rejects invalid findDc %s', (findDc) => {
  expect(o.itemSchema.safeParse({ ...f.item, findDc }).success).toBe(false);
});
test.each([12, null, '15'])('Container rejects invalid findDc %s', (findDc) => {
  expect(o.containerSchema.safeParse({ ...f.container, findDc }).success).toBe(
    false,
  );
});
test('Item accepts an omitted optional damage expression', () => {
  expect(o.itemSchema.safeParse(f.item).success).toBe(true);
});
test('Item rejects null damage instead of an omitted field', () => {
  expect(o.itemSchema.safeParse({ ...f.item, damage: null }).success).toBe(
    false,
  );
});
test('Container rejects an off-scale lock DC', () => {
  expect(
    o.containerSchema.safeParse({ ...f.container, lockDc: 12 }).success,
  ).toBe(false);
});
test('Location rejects a region kind', () => {
  expect(
    o.locationSchema.safeParse({ ...f.location, kind: 'region' }).success,
  ).toBe(false);
});
test('Fact rejects a string boolean', () => {
  expect(o.factSchema.safeParse({ ...f.fact, truth: 'false' }).success).toBe(
    false,
  );
});
test('Quest rejects a misspelled status', () => {
  expect(
    o.questSchema.safeParse({ ...f.quest, status: 'completed' }).success,
  ).toBe(false);
});
