import { expect, test } from 'vitest';
import { edgeSchema, edgeSchemas } from './edges.js';
import {
  knowsEdge,
  provenance,
  supersedesEdge,
  without,
} from './testing/fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

const cases = [
  ['PART_OF', 'loc:room', 'loc:tavern', {}],
  ['LOCATED_IN', 'char:player', 'loc:room', {}],
  ['CARRIES', 'char:player', 'item:quill', {}],
  ['EQUIPPED', 'char:player', 'item:sword', { slot: 'main_hand' }],
  ['CONTAINS', 'container:box', 'item:quill', {}],
  ['MEMBER_OF', 'char:player', 'faction:guild', { rank: 'guest' }],
  [
    'ATTITUDE',
    'char:player',
    'char:brann',
    { value: -20, reason: 'Suspicious.' },
  ],
  ['WANTS', 'char:player', 'quest:quill', { why: 'To earn a reward.' }],
  ['PURSUES', 'char:player', 'quest:quill', {}],
  ['HAS_SECRET', 'char:player', 'fact:quill', {}],
  ['ABOUT', 'fact:quill', 'item:quill', {}],
  ['ORIGIN_OF', 'fact:quill', 'item:quill', {}],
  [
    'KNOWS',
    'char:player',
    'fact:quill',
    { since: 0, source: 'seed', confidence: 0.6 },
  ],
  ['SUPERSEDES', 'fact:quill-correction', 'fact:quill', {}],
  ['WITNESSED', 'char:player', 'event:1-0', {}],
  ['INVOLVES', 'event:1-0', 'char:player', { role: 'actor' }],
] as const;
for (const [type, from, to, properties] of cases) {
  const sample = { ...provenance, type, from, to, properties };
  test(`${type} accepts its endpoints and properties`, () => {
    expect(edgeSchemas[type].safeParse(sample).success).toBe(true);
  });
  test(`edge union accepts ${type}`, () => {
    expect(edgeSchema.safeParse(sample).success).toBe(true);
  });
  test(`${type} requires provenance`, () => {
    expect(
      edgeSchemas[type].safeParse(without(sample, 'createdBy')).success,
    ).toBe(false);
  });
  test(`${type} rejects a quest as its source`, () => {
    expect(
      edgeSchemas[type].safeParse({ ...sample, from: 'quest:quill' }).success,
    ).toBe(false);
  });
}
schemaCases([
  [
    'retracted knowledge',
    edgeSchemas.KNOWS,
    {
      ...knowsEdge,
      properties: { ...knowsEdge.properties, retractedAtBeat: 1 },
    },
    {
      ...knowsEdge,
      properties: { ...knowsEdge.properties, retractedAtBeat: -1 },
    },
  ],
]);
test('KNOWS accepts retraction at beat zero', () => {
  expect(
    edgeSchemas.KNOWS.safeParse({
      ...knowsEdge,
      properties: { ...knowsEdge.properties, retractedAtBeat: 0 },
    }).success,
  ).toBe(true);
});
test.each([1.5, '1', null])(
  'KNOWS rejects retractedAtBeat %s',
  (retractedAtBeat) => {
    expect(
      edgeSchemas.KNOWS.safeParse({
        ...knowsEdge,
        properties: { ...knowsEdge.properties, retractedAtBeat },
      }).success,
    ).toBe(false);
  },
);
test('SUPERSEDES rejects a non-fact target', () => {
  expect(
    edgeSchemas.SUPERSEDES.safeParse({ ...supersedesEdge, to: 'item:quill' })
      .success,
  ).toBe(false);
});
test('SUPERSEDES rejects nonempty properties', () => {
  expect(
    edgeSchemas.SUPERSEDES.safeParse({
      ...supersedesEdge,
      properties: { reason: 'A correction.' },
    }).success,
  ).toBe(false);
});
test('SUPERSEDES requires its creation beat', () => {
  expect(
    edgeSchemas.SUPERSEDES.safeParse(without(supersedesEdge, 'createdAtBeat'))
      .success,
  ).toBe(false);
});
test('ATTITUDE rejects value 150', () => {
  expect(
    edgeSchemas.ATTITUDE.safeParse({
      ...provenance,
      type: 'ATTITUDE',
      from: 'char:player',
      to: 'char:brann',
      properties: { value: 150, reason: 'Friendly.' },
    }).success,
  ).toBe(false);
});
test('KNOWS rejects confidence 1.5', () => {
  expect(
    edgeSchemas.KNOWS.safeParse({
      ...provenance,
      type: 'KNOWS',
      from: 'char:player',
      to: 'fact:quill',
      properties: { since: 0, source: 'told', confidence: 1.5 },
    }).success,
  ).toBe(false);
});
test('EQUIPPED rejects a misspelled slot', () => {
  expect(
    edgeSchemas.EQUIPPED.safeParse({
      ...provenance,
      type: 'EQUIPPED',
      from: 'char:player',
      to: 'item:quill',
      properties: { slot: 'mainHand' },
    }).success,
  ).toBe(false);
});
test('MEMBER_OF rejects null for optional rank', () => {
  expect(
    edgeSchemas.MEMBER_OF.safeParse({
      ...provenance,
      type: 'MEMBER_OF',
      from: 'char:player',
      to: 'faction:guild',
      properties: { rank: null },
    }).success,
  ).toBe(false);
});
test('edge union rejects an unknown type', () => {
  expect(
    edgeSchema.safeParse({
      ...provenance,
      type: 'LIKES',
      from: 'char:player',
      to: 'char:brann',
      properties: {},
    }).success,
  ).toBe(false);
});
