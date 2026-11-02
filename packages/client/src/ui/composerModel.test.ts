import { expect, it } from 'vitest';
import type { Phase } from '../store/types';
import { beatStatus, exampleVerbs, shouldRecall } from './composerModel';
import { snapshot } from '../testing/fixtures';
import { characterDetails } from './possessionsModel';
import { isCharacter } from '../store/world';
import { atJournalBottom } from './useJournalScroll';

it.each([
  ['peers', 'A peer is speaking…'],
  ['dm', 'DM is resolving…'],
  ['npc_voice', 'An NPC is finding their words…'],
  ['critic', 'Checking the narration…'],
  ['dm_retry', 'DM is revising…'],
  ['committing', 'Saving the beat…'],
] satisfies [Phase, string][])(
  'uses CLI wording for %s with singular action and elapsed time',
  (phase, label) => {
    expect(
      beatStatus(
        { number: 1, status: 'running', phase, toolCalls: 1, startedAt: 2000 },
        20500,
      ),
    ).toBe(`${label} 1 action · 18s`);
  },
);
it('handles missing status and a clock earlier than beat start', () => {
  expect(
    beatStatus(
      {
        number: 1,
        status: 'running',
        phase: null,
        toolCalls: null,
        startedAt: 1000,
      },
      0,
    ),
  ).toBe("The Dungeon Master's quill scratches… 0s");
});
it('suggests feature/location verbs and uses the first selection for mixed kinds', () => {
  const entities = Object.fromEntries(
    snapshot.entities.map((node) => [node.id, node]),
  );
  expect(exampleVerbs(['loc:room', 'char:ilsa'], entities)).toBe(
    'inspect, go to…',
  );
  expect(exampleVerbs([], entities)).toBe('I would like to…');
});
it('leaves the draft alone when the caret is unknown and omits unavailable class details', () => {
  expect(shouldRecall('Draft.', null)).toBe(false);
  const character = snapshot.entities.find(isCharacter);
  if (!character) throw new Error('Missing character');
  expect(
    characterDetails({ ...character, tags: [], summary: 'A friend.' }),
  ).toBe('');
});
it('treats a 24px bottom gap as following and a larger gap as reading history', () => {
  expect(atJournalBottom(676, 300, 1000)).toBe(true);
  expect(atJournalBottom(675, 300, 1000)).toBe(false);
});
