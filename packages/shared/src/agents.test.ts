import { expect, test } from 'vitest';
import {
  criticIssueSchema,
  criticIssueTypeSchema,
  criticVerdictSchema,
  modelRoleSchema,
  peerTurnSchema,
} from './agents.js';
import {
  dialogueLineSchema,
  moodSchema,
  narrationSchema,
} from './narration.js';
import { criticIssue, narration } from './testing/fixtures.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  [
    'peer pass',
    peerTurnSchema,
    { kind: 'pass' },
    { kind: 'pass', text: 'I wait.' },
  ],
  [
    'peer intent',
    peerTurnSchema,
    {
      kind: 'intent',
      text: 'Check the box.',
      refs: ['container:box'],
      private: true,
      say: 'I will look.',
    },
    { kind: 'intent', text: 'Look.', refs: [] },
  ],
  [
    'critic issue type',
    criticIssueTypeSchema,
    'perspective_leak',
    'knowledge_leak',
  ],
  [
    'critic issue',
    criticIssueSchema,
    criticIssue,
    { type: 'invented_content', quote: 'Dragon.' },
  ],
  ['critic success', criticVerdictSchema, { ok: true }, { ok: 'true' }],
  [
    'critic rejection',
    criticVerdictSchema,
    { ok: false, issues: [criticIssue] },
    { ok: false, issues: [] },
  ],
  ['model role', modelRoleSchema, 'story', 'npc'],
  ['mood', moodSchema, 'ominous', 'happy'],
  [
    'dialogue line',
    dialogueLineSchema,
    { speaker: 'char:brann', text: 'Welcome.', private: true },
    { speaker: 'Brann', text: 'Welcome.' },
  ],
  ['narration', narrationSchema, narration, { ...narration, mood: 'happy' }],
]);
test.each(criticIssueTypeSchema.options)(
  'critic accepts issue type %s',
  (type) => {
    expect(
      criticVerdictSchema.safeParse({
        ok: false,
        issues: [{ ...criticIssue, type }],
      }).success,
    ).toBe(true);
  },
);
test('peer intent rejects null for optional speech', () => {
  expect(
    peerTurnSchema.safeParse({
      kind: 'intent',
      text: 'Look.',
      refs: [],
      private: false,
      say: null,
    }).success,
  ).toBe(false);
});
test('narrate accepts exactly 180 whitespace-separated words', () => {
  expect(
    narrationSchema.safeParse({
      ...narration,
      text: `  ${Array.from({ length: 180 }, () => 'word').join('\n\t ')}  `,
    }).success,
  ).toBe(true);
});
test('narrate rejects 181 words', () => {
  expect(
    narrationSchema.safeParse({
      ...narration,
      text: Array.from({ length: 181 }, () => 'word').join(' '),
    }).success,
  ).toBe(false);
});
test('narrate rejects misspelled nested dialogue fields', () => {
  expect(
    narrationSchema.safeParse({
      ...narration,
      lines: [{ speaker: 'char:brann', text: 'Hello.', privte: true }],
    }).success,
  ).toBe(false);
});
test('narrate rejects null for optional mood', () => {
  expect(narrationSchema.safeParse({ ...narration, mood: null }).success).toBe(
    false,
  );
});
