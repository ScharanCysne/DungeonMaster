import { expect, it } from 'vitest';
import { journalEntries } from '../testing/journal';
import { freeze } from '../testing/fixtures';
import { revealSchedule } from './reveal';

const visible = (ms: number) => revealSchedule(freeze(journalEntries), 1, ms);
const ids = (ms: number) => visible(ms).entries.map((entry) => entry.id);
it('keeps past beats, headers and intent visible while the first stamp lands immediately', () => {
  expect(ids(0)).toEqual(['old', 'header', 'intent', 'stamp1']);
  expect(visible(0).stamping).toEqual(['stamp1']);
});
it('gives each stamp 150ms before starting narration', () => {
  expect(ids(149)).not.toContain('stamp2');
  expect(visible(150).stamping).toEqual(['stamp2']);
  expect(ids(300)).not.toContain('narration');
  expect(visible(300).stamping).toEqual([]);
});
it('reveals narration at 40 words per second and retains original whitespace', () => {
  expect(
    visible(325).entries.find((entry) => entry.id === 'narration'),
  ).toMatchObject({ text: 'One ' });
  const entries = [
    {
      id: 'n',
      beat: 1,
      kind: 'narration',
      text: '  One\n two.  ',
    } satisfies (typeof journalEntries)[number],
  ];
  expect(revealSchedule(entries, 1, 25).entries[0]).toMatchObject({
    text: '  One\n ',
  });
  expect(revealSchedule(entries, 1, 50).entries[0]).toEqual(entries[0]);
});
it('reveals dialogue after narration, then notes at 150ms intervals', () => {
  expect(ids(399)).not.toContain('line1');
  expect(ids(400)).toContain('line1');
  expect(ids(549)).not.toContain('line2');
  expect(ids(550)).toContain('line2');
  expect(ids(699)).not.toContain('note');
  expect(ids(700)).toContain('note');
  expect(visible(849).complete).toBe(false);
  expect(visible(850)).toMatchObject({ complete: true, durationMs: 850 });
});
it('schedules by entry kind even when input entries are out of order', () => {
  const entries = journalEntries
    .filter((entry) => entry.beat === 1)
    .toReversed();
  expect(
    revealSchedule(entries, 1, 0).entries.map((entry) => entry.id),
  ).toEqual(['stamp2', 'intent', 'header']);
});
it('skip and reduced motion share the instant path without stamp animations', () => {
  expect(revealSchedule(journalEntries, 1, 0, true)).toMatchObject({
    entries: journalEntries,
    complete: true,
    stamping: [],
  });
});
it('does not hide progress that was already visible or pause and chapter notes', () => {
  const entries = [
    {
      id: 'progress:1:0',
      beat: 1,
      kind: 'dialogue',
      status: 'final',
      speaker: 'char:ilsa',
      text: 'Seen already.',
    },
    { id: 'pause:1:0', beat: 1, kind: 'note', text: 'Paused.' },
    {
      id: 'end',
      beat: 1,
      kind: 'episode_end',
      holder: 'char:player',
      text: 'Done.',
    },
  ] satisfies typeof journalEntries;
  expect(revealSchedule(entries, 1, 0)).toMatchObject({
    entries,
    complete: true,
  });
});
it('handles empty narration, missing beats and negative elapsed time', () => {
  expect(revealSchedule([], 1, 0).complete).toBe(true);
  expect(revealSchedule(journalEntries, null, 0).entries).toEqual(
    journalEntries,
  );
  expect(ids(-1)).toEqual(ids(0));
  expect(
    revealSchedule([{ id: 'n', beat: 1, kind: 'narration', text: '' }], 1, 0)
      .complete,
  ).toBe(true);
});
