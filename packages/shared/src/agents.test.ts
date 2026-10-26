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
  resolvedDialogueLineSchema,
  resolvedNarrationSchema,
} from './narration.js';
import {
  criticIssue,
  narration,
  npcLine,
  peerLine,
  resolvedNarration,
} from './testing/fixtures.js';
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
  ['model role', modelRoleSchema, 'npc_voice', 'npc'],
  ['mood', moodSchema, 'ominous', 'happy'],
  [
    'peer dialogue line',
    dialogueLineSchema,
    peerLine,
    { ...peerLine, speaker: 'Kael' },
  ],
  [
    'NPC dialogue reference',
    dialogueLineSchema,
    { lineId: npcLine.lineId },
    { lineId: '' },
  ],
  ['narration', narrationSchema, narration, { ...narration, mood: 'happy' }],
  [
    'resolved NPC dialogue line',
    resolvedDialogueLineSchema,
    { speaker: 'char:brann', ...npcLine },
    { ...npcLine, speaker: 'item:quill' },
  ],
  [
    'resolved peer dialogue line',
    resolvedDialogueLineSchema,
    peerLine,
    { text: peerLine.text },
  ],
  ['resolved narration', resolvedNarrationSchema, resolvedNarration, narration],
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
test.each([
  ['an NPC line with text instead of lineId', { text: npcLine.text }],
  ['an NPC reference with inline text', npcLine],
  ['a peer line missing its speaker', { text: peerLine.text }],
  [
    'a peer line with a non-character speaker',
    { ...peerLine, speaker: 'item:quill' },
  ],
  ['a peer line with empty text', { ...peerLine, text: '' }],
  ['the removed private field', { ...peerLine, private: true }],
  [
    'a mixed NPC reference and peer line',
    { ...peerLine, lineId: npcLine.lineId },
  ],
])('narrate rejects %s', (_name, line) => {
  expect(
    narrationSchema.safeParse({ ...narration, lines: [line] }).success,
  ).toBe(false);
});
test.each([
  ['an unresolved NPC reference', { lineId: npcLine.lineId }],
  ['empty dialogue text', { ...peerLine, text: '' }],
  ['an empty optional lineId', { ...peerLine, lineId: '' }],
  ['a null optional lineId', { ...peerLine, lineId: null }],
  ['the removed private field', { ...peerLine, private: true }],
])('resolved narration rejects %s', (_name, line) => {
  expect(
    resolvedNarrationSchema.safeParse({ ...resolvedNarration, lines: [line] })
      .success,
  ).toBe(false);
});
test('resolved narration accepts exactly 180 whitespace-separated words', () => {
  expect(
    resolvedNarrationSchema.safeParse({
      ...resolvedNarration,
      text: `  ${Array.from({ length: 180 }, () => 'word').join('\n\t ')}  `,
    }).success,
  ).toBe(true);
});
test('resolved narration rejects 181 words', () => {
  expect(
    resolvedNarrationSchema.safeParse({
      ...resolvedNarration,
      text: Array.from({ length: 181 }, () => 'word').join(' '),
    }).success,
  ).toBe(false);
});
test('critic issue types reject a misspelled temporal contradiction', () => {
  expect(
    criticIssueTypeSchema.safeParse('temporal_contradiciton').success,
  ).toBe(false);
});
