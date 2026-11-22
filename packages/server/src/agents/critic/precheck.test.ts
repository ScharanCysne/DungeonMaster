import { beforeEach, expect, it } from 'vitest';
import type { CharacterId } from '@dungeon/shared';
import type { CheckReceipt } from '../../engine/receipts.js';
import { criticContext } from './context.js';
import { precheck } from './precheck.js';
import type { PrecheckInput } from './precheck.js';
import { proposal, setup } from './testing.js';

let input: PrecheckInput;
beforeEach(async () => {
  const { ctx, options } = await setup();
  input = (await criticContext(ctx, proposal, [], options.intents))
    .deterministic;
});

it('accepts an innocuous narration', () =>
  expect(precheck(input).issues).toEqual([]));
it.each(['narration', 'dialogue'])(
  'rejects undiscovered hidden names in %s',
  (where) => {
    const hidden = input.entities.find(
      (node) =>
        'hidden' in node && node.hidden && !input.discovered.has(node.id),
    );
    if (!hidden) throw new Error('Expected an undiscovered entity');
    const text = `Nearby lies ${hidden.name.toUpperCase()}.`;
    input.narration =
      where === 'narration'
        ? { text, lines: [] }
        : { text: '', lines: [{ speaker: 'char:ilsa', text }] };
    expect(precheck(input).issues).toContainEqual(
      expect.objectContaining({ type: 'perspective_leak', quote: text }),
    );
    input.discovered = new Set([hidden.id]);
    expect(precheck(input).issues).toEqual([]);
  },
);

it('does not match a hidden name inside another word', () => {
  const hidden = input.entities.find((node) => 'hidden' in node && node.hidden);
  if (!hidden) throw new Error('Expected a hidden entity');
  input.narration = { text: `prefix${hidden.name}suffix`, lines: [] };
  expect(precheck(input).issues).toEqual([]);
});

it.each([
  { present: false, conscious: true },
  { present: true, conscious: false },
])('rejects absent/unconscious speakers: %j', (speaker) => {
  input.speakers = new Map([['char:ilsa', speaker]]);
  input.narration = {
    text: '',
    lines: [{ speaker: 'char:ilsa', text: 'Hello.' }],
  };
  expect(precheck(input).issues).toMatchObject([
    { type: 'state_contradiction' },
  ]);
});

it('rejects a missing speaker', () => {
  input.narration = {
    text: '',
    lines: [{ speaker: 'char:missing', text: 'Hello.' }],
  };
  expect(precheck(input).issues).toMatchObject([
    { type: 'state_contradiction' },
  ]);
});

it.each([
  'You succeed.',
  'You failed.',
  'The check succeeds.',
  'Your attempt failed.',
])('rejects check outcome without a check: %s', (text) => {
  input.narration = { text, lines: [] };
  expect(precheck(input).issues).toMatchObject([{ type: 'unbacked_outcome' }]);
});

it('allows outcome words when a check ran, and does not mutate the input', async () => {
  const { ctx } = await setup();
  ctx.engine.skill_check({
    actor: 'char:kael',
    skill: 'perception',
    dc: 10,
    advantage: 'none',
    reason: 'Look closely.',
  });
  input.events = ctx.engine.collectEvents();
  input.narration = { text: 'You succeed.', lines: [] };
  const before = structuredClone(input);
  expect(precheck(input).issues).toEqual([]);
  expect(input).toEqual(before);
});

it.each(['missing', 'old', 'altered', 'other-speaker', 'valid'])(
  'validates exact NPC voice provenance: %s',
  (mode) => {
    const npc: CharacterId = 'char:tobb';
    const text = 'A quiet evening.';
    input.voicedLines = new Map([['current', { speaker: npc, text }]]);
    input.narration = {
      text: '',
      lines: [
        {
          speaker: npc,
          text: mode === 'altered' ? 'Added details.' : text,
          ...(mode !== 'missing'
            ? { lineId: mode === 'old' ? 'old' : 'current' }
            : {}),
        },
      ],
    };
    if (mode === 'other-speaker')
      input.voicedLines = new Map([
        ['current', { speaker: 'char:brann', text }],
      ]);
    expect(precheck(input).issues.map(({ type }) => type)).toEqual(
      mode === 'valid' ? [] : ['invented_content'],
    );
  },
);

it('lists only current successful unspent receipts as hints, without rejecting', () => {
  const receipt: CheckReceipt = {
    id: 'chk_1_1',
    actor: 'char:kael',
    skill: 'stealth',
    total: 20,
    outcome: 'success',
    spent: false,
    beat: 1,
  };
  input.receipts = [
    receipt,
    { ...receipt, spent: true },
    { ...receipt, beat: 0 },
    { ...receipt, outcome: 'failure' },
  ];
  expect(precheck(input)).toEqual({ issues: [], unspentReceipts: [receipt] });
});
