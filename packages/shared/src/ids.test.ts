import { expect, expectTypeOf, test } from 'vitest';
import * as ids from './ids.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  ['slug label', ids.slugLabelSchema, 'char', 'event'],
  ['entity label', ids.entityLabelSchema, 'event', 'CHAR'],
  ['slug', ids.slugSchema, 'brass-key-2', 'Brass Key'],
  ['character id', ids.characterIdSchema, 'char:brann', 'item:brann'],
  ['item id', ids.itemIdSchema, 'item:quill', 'char:quill'],
  ['location id', ids.locationIdSchema, 'loc:cellar', 'location:cellar'],
  ['container id', ids.containerIdSchema, 'container:barrel', 'container:'],
  ['faction id', ids.factionIdSchema, 'faction:guild', 'Faction:guild'],
  ['quest id', ids.questIdSchema, 'quest:find-quill', 'quest:find_quill'],
  ['fact id', ids.factIdSchema, 'fact:odo-hid-quill', 'fact:two--hyphens'],
  ['event id', ids.eventIdSchema, 'event:12-3', 'event:beat-3'],
  ['entity id', ids.entityIdSchema, 'char:brann', 'brann'],
]);
test.each([
  'brann',
  'char:',
  'CHAR:Brann',
  'char:Brann',
  'char:-brann',
  'char:brann-',
  'event:1.5-0',
  'event:-1-0',
  'event:01-0',
  'event:1-0-2',
])('entity ids reject %s', (value) => {
  expect(ids.entityIdSchema.safeParse(value).success).toBe(false);
});
test('per-label ids retain their template literal types', () => {
  expectTypeOf<ids.CharacterId>().toEqualTypeOf<`char:${string}`>();
});
test.each([
  [' The Brass Key! ', 'the-brass-key'],
  ['Éowyn’s  Quill', 'eowyn-s-quill'],
  ['---', 'unnamed'],
  ['', 'unnamed'],
  ['Rope__2', 'rope-2'],
])('slugify turns %j into %j', (name, expected) => {
  expect(ids.slugify(name)).toBe(expected);
});
test('uniqueId uses the unsuffixed name when it is available', () => {
  expect(ids.uniqueId('item', 'Silver Thimble', [])).toBe(
    'item:silver-thimble',
  );
});
test('uniqueId starts collision suffixes at two', () => {
  expect(ids.uniqueId('item', 'Silver Thimble', ['item:silver-thimble'])).toBe(
    'item:silver-thimble-2',
  );
});
test('uniqueId skips occupied suffixes', () => {
  expect(
    ids.uniqueId(
      'item',
      'Silver Thimble',
      new Set(['item:silver-thimble', 'item:silver-thimble-2']),
    ),
  ).toBe('item:silver-thimble-3');
});
test('uniqueId scopes collisions to the label', () => {
  expect(ids.uniqueId('char', 'Brann', ['fact:brann'])).toBe('char:brann');
});
test('uniqueId does not mutate existing ids', () => {
  const existing = new Set(['item:key']);
  ids.uniqueId('item', 'Key', existing);
  expect([...existing]).toEqual(['item:key']);
});
