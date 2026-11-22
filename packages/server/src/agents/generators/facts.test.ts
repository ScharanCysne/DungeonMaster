import { expect, it } from 'vitest';
import { executeToolCall } from '../tools/execute.js';
import { rejects } from '../tools/testing/fixtures.js';
import { factIdentity } from './factIdentity.js';
import {
  fixture,
  item,
  itemInput,
  npc,
  npcInput,
  story,
  storyInput,
  structured,
} from './testing.js';

const statements = [
  'A traveling merchant left the thimble charm with Brann as a pledge against a tab.',
  'The traveling merchant left the thimble charm with Marta for safekeeping.',
];

it.each([
  [
    '  An ÉLDER’S silver ring fell beneath the hearth.',
    'elder-s-silver-ring-fell-beneath',
    'ÉLDER’S silver ring fell beneath the',
  ],
  [
    'The a an old cooper hid a letter.',
    'old-cooper-hid-a-letter',
    'old cooper hid a letter',
  ],
  [
    'Marta cut three notches, then wept.',
    'marta-cut-three-notches-then-wept',
    'Marta cut three notches, then wept',
  ],
  ['!!!', 'unnamed', 'unnamed'],
])(
  'derives a short id and a name in the statement’s own wording from %s',
  (statement, slug, name) => {
    const identity = factIdentity(statement, new Set());
    expect(identity.id).toBe(`fact:${slug}`);
    expect(identity.name).toBe(name);
  },
);

it.each([
  statements[0] ?? '',
  `${'x'.repeat(100)} carried an extremely long forgotten tale.`,
  'An extraordinarily knowledgeable traveling merchant remembered everything.',
])(
  'keeps repeated collisions unique and within 48 characters: %s',
  (statement) => {
    const ids = new Set<string>();
    for (let index = 0; index < 120; index++) {
      const { id, name } = factIdentity(`${statement} Version ${index}.`, ids);
      expect(id.length).toBeLessThanOrEqual(48);
      expect(name.split(' ').length).toBeLessThanOrEqual(8);
      expect(id).toMatch(/^fact:[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(120);
  },
);

const histories = statements.map((statement) => ({
  statement,
  kind: 'backstory',
  truth: true,
  about: [],
}));

it.each([
  {
    name: 'item histories',
    tool: 'generate_item',
    input: itemInput,
    output: { ...item, backstory: histories },
    role: 'generator' as const,
  },
  {
    name: 'NPC secret and inventory history',
    tool: 'generate_npc',
    input: npcInput,
    output: {
      ...npc,
      secret: { ...histories[0], kind: 'secret' },
      startingItems: [{ ...item, backstory: [histories[1]] }],
    },
    role: 'generator' as const,
  },
  {
    name: 'story facts',
    tool: 'generate_story',
    input: storyInput,
    output: { facts: histories.map((fact) => ({ ...fact, kind: 'lore' })) },
    role: 'story' as const,
  },
])(
  'shortens $name without losing statements or colliding IDs',
  async ({ tool, input, output, role }) => {
    const { ctx } = await fixture([structured(output)], { role });
    const result = await executeToolCall(tool, input, ctx);
    if (!result.ok) throw new Error(result.error.message);
    const facts = ctx.events.flatMap((event) =>
      event.type === 'FactCreated' ? [event.payload.fact] : [],
    );
    expect(facts.map((fact) => fact.statement)).toEqual(statements);
    expect(facts.map((fact) => fact.summary)).toEqual(statements);
    expect(facts.map((fact) => fact.id)).toEqual([
      'fact:traveling-merchant-left-the-thimble-charm',
      'fact:traveling-merchant-left-the-thimble-charm-2',
    ]);
    for (const fact of facts) {
      expect(fact.name).toBe('traveling merchant left the thimble charm');
      expect(fact.id.length).toBeLessThanOrEqual(48);
    }
  },
);

it('suffixes a fact collision with pending graph state but still rejects repeated statements', async () => {
  const first = { facts: [{ ...story.facts[0], statement: statements[0] }] };
  const second = { facts: [{ ...story.facts[0], statement: statements[1] }] };
  const { ctx } = await fixture(
    [first, second, second, second].map(structured),
    { role: 'story' },
  );
  for (let index = 0; index < 2; index++)
    expect((await executeToolCall('generate_story', storyInput, ctx)).ok).toBe(
      true,
    );
  expect(ctx.storyFacts[1]?.facts[0]?.id).toBe(
    'fact:traveling-merchant-left-the-thimble-charm-2',
  );
  await rejects(
    ctx,
    'generate_story',
    storyInput,
    'GENERATION_FAILED',
    'duplicates',
  );
});
