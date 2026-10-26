import { expect, test } from 'vitest';
import * as s from './seed.js';
import { seed, without } from './testing/fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  [
    'seed location',
    s.seedLocationSchema,
    seed.locations[0],
    { ...seed.locations[0], kind: 'region' },
  ],
  [
    'seed character',
    s.seedCharacterSchema,
    seed.characters[0],
    without(seed.characters[0] ?? {}, 'gold'),
  ],
  [
    'seed container',
    s.seedContainerSchema,
    seed.containers[0],
    { ...seed.containers[0], lockDc: '15' },
  ],
  [
    'seed item',
    s.seedItemSchema,
    seed.items[0],
    { ...seed.items[0], holder: { kind: 'container', id: 'char:player' } },
  ],
  [
    'seed knowledge',
    s.seedKnowledgeSchema,
    { character: 'char:player', confidence: 0.6 },
    { character: 'char:player', confidence: 1.5 },
  ],
  [
    'seed fact',
    s.seedFactSchema,
    seed.facts[0],
    without(seed.facts[0] ?? {}, 'statement'),
  ],
  [
    'seed episode quest',
    s.seedQuestSchema,
    seed.quests[0],
    { ...seed.quests[0], status: 'completed' },
  ],
  [
    'seed personal quest',
    s.seedQuestSchema,
    seed.quests[1],
    without(seed.quests[1] ?? {}, 'pursuedBy'),
  ],
  [
    'seed faction member',
    s.seedFactionMemberSchema,
    { character: 'char:player' },
    { character: 'char:player', rank: null },
  ],
  [
    'seed faction',
    s.seedFactionSchema,
    seed.factions[0],
    without(seed.factions[0] ?? {}, 'members'),
  ],
  [
    'seed attitude',
    s.seedAttitudeSchema,
    seed.attitudes[0],
    { ...seed.attitudes[0], value: 150 },
  ],
  [
    'seed secret',
    s.seedSecretSchema,
    seed.secrets[0],
    { character: 'char:player', fact: 'item:quill' },
  ],
  ['episode seed', s.episodeSeedSchema, seed, without(seed, 'locations')],
]);
test('seed facts accept the sparse metadata in the spec fragment', () => {
  expect(
    s.seedFactSchema.safeParse({
      id: 'fact:odo-hid-quill',
      statement: 'Odo hid the quill.',
      truth: true,
      kind: 'lore',
      about: ['item:quill', 'loc:cellar'],
      knownBy: [{ character: 'char:brann', confidence: 0.6 }],
    }).success,
  ).toBe(true);
});
test('seed locations accept PART_OF parents', () => {
  expect(
    s.seedLocationSchema.safeParse({
      ...seed.locations[0],
      partOf: 'loc:tavern',
    }).success,
  ).toBe(true);
});
test('seed parsing leaves unresolved references for the reference validator', () => {
  expect(
    s.episodeSeedSchema.safeParse({
      ...seed,
      secrets: [{ character: 'char:missing', fact: 'fact:missing' }],
    }).success,
  ).toBe(true);
});
test('a small connected seed has no reference problems', () => {
  expect(s.validateSeedReferences(seed)).toEqual([]);
});
test('duplicate ids are reported by value', () => {
  expect(
    s.validateSeedReferences({
      ...seed,
      locations: [...seed.locations, ...seed.locations],
    }),
  ).toContain('Duplicate id "loc:room"');
});
const referenceCases: ReadonlyArray<
  readonly [string, (value: s.EpisodeSeed) => void, string]
> = [
  [
    'PART_OF parent',
    (value) => {
      value.locations[0]!.partOf = 'loc:missing-parent';
    },
    'loc:missing-parent',
  ],
  [
    'character location',
    (value) => {
      value.characters[0]!.location = 'loc:missing-character-room';
    },
    'loc:missing-character-room',
  ],
  [
    'container location',
    (value) => {
      value.containers[0]!.location = 'loc:missing-container-room';
    },
    'loc:missing-container-room',
  ],
  [
    'item holder',
    (value) => {
      value.items[0]!.holder = { kind: 'character', id: 'char:missing-holder' };
    },
    'char:missing-holder',
  ],
  [
    'fact about',
    (value) => {
      value.facts[0]!.about = ['item:missing-subject'];
    },
    'item:missing-subject',
  ],
  [
    'fact knower',
    (value) => {
      value.facts[0]!.knownBy = [
        { character: 'char:missing-knower', confidence: 1 },
      ];
    },
    'char:missing-knower',
  ],
  [
    'personal quest pursuer',
    (value) => {
      value.quests = [
        {
          ...value.quests[0]!,
          kind: 'personal',
          pursuedBy: 'char:missing-pursuer',
        },
      ];
    },
    'char:missing-pursuer',
  ],
  [
    'faction member',
    (value) => {
      value.factions[0]!.members = [{ character: 'char:missing-member' }];
    },
    'char:missing-member',
  ],
  [
    'attitude source',
    (value) => {
      value.attitudes[0]!.from = 'char:missing-from';
    },
    'char:missing-from',
  ],
  [
    'attitude target',
    (value) => {
      value.attitudes[0]!.to = 'char:missing-to';
    },
    'char:missing-to',
  ],
  [
    'secret owner',
    (value) => {
      value.secrets[0]!.character = 'char:missing-owner';
    },
    'char:missing-owner',
  ],
  [
    'secret fact',
    (value) => {
      value.secrets[0]!.fact = 'fact:missing-secret';
    },
    'fact:missing-secret',
  ],
];
for (const [name, mutate, id] of referenceCases) {
  test(`reference validation names the unknown ${name}`, () => {
    const value = s.episodeSeedSchema.parse(seed);
    mutate(value);
    expect(s.validateSeedReferences(value)).toEqual([
      expect.stringContaining(`unknown id "${id}"`),
    ]);
  });
}
test('reference validation reports every bad value in one pass', () => {
  const value = {
    ...seed,
    secrets: [
      { character: 'char:nobody' as const, fact: 'fact:nothing' as const },
    ],
  };
  expect(s.validateSeedReferences(value)).toEqual([
    'secret fact:nothing owner: unknown id "char:nobody"',
    'secret of char:nobody: unknown id "fact:nothing"',
  ]);
});
test('reference validation requires one questCritical item', () => {
  expect(
    s.validateSeedReferences({
      ...seed,
      items: seed.items.map((item) => ({ ...item, questCritical: false })),
    }),
  ).toContain('Expected exactly one questCritical item; found 0: (none)');
});
test('reference validation names multiple questCritical items', () => {
  const extra = s.seedItemSchema.parse({
    ...seed.items[0],
    id: 'item:second-quill',
  });
  expect(
    s.validateSeedReferences({ ...seed, items: [...seed.items, extra] }),
  ).toContain(
    'Expected exactly one questCritical item; found 2: item:quill, item:second-quill',
  );
});
test('reference validation requires one player', () => {
  expect(
    s.validateSeedReferences({
      ...seed,
      characters: seed.characters.map((character) => ({
        ...character,
        role: 'npc',
      })),
    }),
  ).toContain('Expected exactly one player; found 0: (none)');
});
test('reference validation names multiple players', () => {
  const extra = s.seedCharacterSchema.parse({
    ...seed.characters[0],
    id: 'char:second-player',
  });
  expect(
    s.validateSeedReferences({
      ...seed,
      characters: [...seed.characters, extra],
    }),
  ).toContain(
    'Expected exactly one player; found 2: char:player, char:second-player',
  );
});
test('reference validation leaves the seed unchanged', () => {
  const before = s.episodeSeedSchema.parse(seed);
  s.validateSeedReferences(seed);
  expect(seed).toEqual(before);
});
