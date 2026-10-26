import { expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { checkIdSchema, toolResultSchema, toolSchemas } from './tools.js';
import type { ToolResult } from './tools.js';
import { without } from './testing/fixtures.js';
import { movedEvent } from './testing/event-fixtures.js';
import { toolInputs, toolOutputs } from './testing/tool-fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

for (const name of Object.keys(toolSchemas) as (keyof typeof toolSchemas)[]) {
  const { input, output } = toolSchemas[name];
  const sample = toolInputs[name];
  const result = toolOutputs[name];
  test(`${name} input accepts a valid request`, () => {
    expect(input.safeParse(sample).success).toBe(true);
  });
  test(`${name} input rejects an unknown key`, () => {
    expect(input.safeParse({ ...sample, extra: 'LLM invention' }).success).toBe(
      false,
    );
  });
  test(`${name} input rejects a missing required field`, () => {
    expect(
      input.safeParse(without(sample, Object.keys(sample)[0] ?? '')).success,
    ).toBe(false);
  });
  test(`${name} input rejects prose around JSON`, () => {
    expect(
      input.safeParse(`Here is the input: ${JSON.stringify(sample)}`).success,
    ).toBe(false);
  });
  test(`${name} output accepts a valid result`, () => {
    expect(output.safeParse(result).success).toBe(true);
  });
  test(`${name} output rejects a missing required field`, () => {
    expect(
      output.safeParse(without(result, Object.keys(result)[0] ?? '')).success,
    ).toBe(false);
  });
}
schemaCases([['check id', checkIdSchema, 'check:1-0', '']]);
schemaCases([
  [
    'create_fact supersedes',
    toolSchemas.create_fact.input,
    { ...toolInputs.create_fact, supersedes: 'fact:old-clue' },
    { ...toolInputs.create_fact, supersedes: 'container:box' },
  ],
]);
test('create_fact rejects null for optional supersedes', () => {
  expect(
    toolSchemas.create_fact.input.safeParse({
      ...toolInputs.create_fact,
      supersedes: null,
    }).success,
  ).toBe(false);
});
test('create_fact leaves questCritical subject checks to the handler', () => {
  expect(
    toolSchemas.create_fact.input.safeParse({
      ...toolInputs.create_fact,
      about: ['item:quill'],
    }).success,
  ).toBe(true);
});
test('voice_npc accepts exactly 40 whitespace-separated words', () => {
  expect(
    toolSchemas.voice_npc.input.safeParse({
      ...toolInputs.voice_npc,
      direction: `  ${Array.from({ length: 40 }, () => 'word').join('\n\t ')}  `,
    }).success,
  ).toBe(true);
});
test('voice_npc rejects a direction of 41 words', () => {
  expect(
    toolSchemas.voice_npc.input.safeParse({
      ...toolInputs.voice_npc,
      direction: Array.from({ length: 41 }, () => 'word').join(' '),
    }).success,
  ).toBe(false);
});
test('voice_npc rejects an empty direction', () => {
  expect(
    toolSchemas.voice_npc.input.safeParse({
      ...toolInputs.voice_npc,
      direction: '',
    }).success,
  ).toBe(false);
});
test('voice_npc rejects a non-character NPC id', () => {
  expect(
    toolSchemas.voice_npc.input.safeParse({
      ...toolInputs.voice_npc,
      npc: 'item:quill',
    }).success,
  ).toBe(false);
});
test.each(['lineId', 'text'])(
  'voice_npc output rejects an empty %s',
  (field) => {
    expect(
      toolSchemas.voice_npc.output.safeParse({
        ...toolOutputs.voice_npc,
        [field]: '',
      }).success,
    ).toBe(false);
  },
);
test('voice_npc output rejects extra fields', () => {
  expect(
    toolSchemas.voice_npc.output.safeParse({
      ...toolOutputs.voice_npc,
      speaker: 'char:brann',
    }).success,
  ).toBe(false);
});
test('voice_npc result preserves the generated line', () => {
  expect(
    toolResultSchema(toolSchemas.voice_npc.output).parse({
      ok: true,
      value: toolOutputs.voice_npc,
      events: [],
      facts: [],
    }),
  ).toEqual({ ok: true, value: toolOutputs.voice_npc, events: [], facts: [] });
});
test.each([12, '15', null])('skill_check rejects invalid DC %s', (dc) => {
  expect(
    toolSchemas.skill_check.input.safeParse({ ...toolInputs.skill_check, dc })
      .success,
  ).toBe(false);
});
test('skill_check rejects both skill and ability', () => {
  expect(
    toolSchemas.skill_check.input.safeParse({
      ...toolInputs.skill_check,
      ability: 'wis',
    }).success,
  ).toBe(false);
});
test('skill_check rejects neither skill nor ability', () => {
  expect(
    toolSchemas.skill_check.input.safeParse(
      without(toolInputs.skill_check, 'skill'),
    ).success,
  ).toBe(false);
});
test('skill_check accepts an ability in place of a skill', () => {
  expect(
    toolSchemas.skill_check.input.safeParse({
      ...without(toolInputs.skill_check, 'skill'),
      ability: 'wis',
    }).success,
  ).toBe(true);
});
test.each(['none', 'advantage', 'disadvantage'])(
  'skill_check accepts %s',
  (advantage) => {
    expect(
      toolSchemas.skill_check.input.safeParse({
        ...toolInputs.skill_check,
        advantage,
      }).success,
    ).toBe(true);
  },
);
test('skill_check rejects a misspelled advantage', () => {
  expect(
    toolSchemas.skill_check.input.safeParse({
      ...toolInputs.skill_check,
      advantage: 'disadvantge',
    }).success,
  ).toBe(false);
});
test.each([-31, 31, 150, '15'])('set_attitude rejects delta %s', (delta) => {
  expect(
    toolSchemas.set_attitude.input.safeParse({
      ...toolInputs.set_attitude,
      delta,
    }).success,
  ).toBe(false);
});
test.each([-30, 30])('set_attitude accepts endpoint %i', (delta) => {
  expect(
    toolSchemas.set_attitude.input.safeParse({
      ...toolInputs.set_attitude,
      delta,
    }).success,
  ).toBe(true);
});
test.each(['secret', 'backstory', 'rumor'])(
  'create_fact rejects kind %s',
  (kind) => {
    expect(
      toolSchemas.create_fact.input.safeParse({
        ...toolInputs.create_fact,
        kind,
      }).success,
    ).toBe(false);
  },
);
test.each(['rumour', 'observation', 'lore'])(
  'create_fact accepts kind %s',
  (kind) => {
    expect(
      toolSchemas.create_fact.input.safeParse({
        ...toolInputs.create_fact,
        kind,
      }).success,
    ).toBe(true);
  },
);
test.each(['pick_up', 'give', 'drop', 'steal', 'buy', 'loot'])(
  'transfer_item accepts reason %s with required receipt or price',
  (reason) => {
    expect(
      toolSchemas.transfer_item.input.safeParse({
        ...toolInputs.transfer_item,
        reason,
        checkId: 'check:1-0',
        price: 5,
      }).success,
    ).toBe(true);
  },
);
test.each(['steal', 'buy', 'teleport'])(
  'transfer_item rejects unsupported or incomplete reason %s',
  (reason) => {
    expect(
      toolSchemas.transfer_item.input.safeParse({
        ...toolInputs.transfer_item,
        reason,
      }).success,
    ).toBe(false);
  },
);
test.each(['key', 'lockpick', 'force'])(
  'unlock_container accepts method %s with its proof field',
  (method) => {
    expect(
      toolSchemas.unlock_container.input.safeParse({
        ...toolInputs.unlock_container,
        method,
        checkId: 'check:1-0',
      }).success,
    ).toBe(true);
  },
);
test.each(['key', 'lockpick', 'force', 'magic'])(
  'unlock_container rejects incomplete or unsupported method %s',
  (method) => {
    expect(
      toolSchemas.unlock_container.input.safeParse({
        ...without(toolInputs.unlock_container, 'itemId'),
        method,
      }).success,
    ).toBe(false);
  },
);
test('attack rejects null for optional weaponId', () => {
  expect(
    toolSchemas.attack.input.safeParse({ ...toolInputs.attack, weaponId: null })
      .success,
  ).toBe(false);
});
test('generate_item rejects misspelled nested constraints', () => {
  expect(
    toolSchemas.generate_item.input.safeParse({
      ...toolInputs.generate_item,
      constraints: { maxRarety: 'rare' },
    }).success,
  ).toBe(false);
});
test('generate_npc rejects unknown nested hints', () => {
  expect(
    toolSchemas.generate_npc.input.safeParse({
      ...toolInputs.generate_npc,
      hints: { attitude: 10 },
    }).success,
  ).toBe(false);
});
test('generate_feature rejects null instead of an omitted hidden flag', () => {
  expect(
    toolSchemas.generate_feature.input.safeParse({
      ...toolInputs.generate_feature,
      hidden: null,
    }).success,
  ).toBe(false);
});
test('share_fact rejects seed as a live learning source', () => {
  expect(
    toolSchemas.share_fact.input.safeParse({
      ...toolInputs.share_fact,
      source: 'seed',
    }).success,
  ).toBe(false);
});
const resultSchema = toolResultSchema(z.strictObject({ total: z.int() }));
schemaCases([
  [
    'successful tool result',
    resultSchema,
    {
      ok: true,
      value: { total: 15 },
      events: [movedEvent],
      facts: ['You spot a box.'],
    },
    { ok: true, value: { total: '15' }, events: [], facts: [] },
  ],
  [
    'failed tool result',
    resultSchema,
    {
      ok: false,
      error: { code: 'LOCKED', message: 'container:box is locked' },
    },
    { ok: false, error: { code: 'LOCKED' } },
  ],
]);
test('ToolResult preserves its inferred value type', () => {
  expectTypeOf<
    Extract<ToolResult<number>, { ok: true }>['value']
  >().toEqualTypeOf<number>();
});
test('tool results reject mixed success and failure branches', () => {
  expect(
    resultSchema.safeParse({
      ok: false,
      value: { total: 15 },
      error: { code: 'LOCKED', message: 'Locked.' },
    }).success,
  ).toBe(false);
});
