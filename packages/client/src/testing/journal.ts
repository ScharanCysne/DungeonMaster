import type { JournalEntry } from '../store/types';

export const journalEntries: JournalEntry[] = [
  { id: 'old', beat: 0, kind: 'narration', text: 'An older story.' },
  { id: 'header', beat: 1, kind: 'beat_header' },
  {
    id: 'intent',
    beat: 1,
    kind: 'intent',
    text: 'Search the box.',
    selection: ['container:box'],
  },
  {
    id: 'stamp1',
    beat: 1,
    kind: 'stamp',
    text: 'Search → success',
    outcome: 'success',
  },
  {
    id: 'stamp2',
    beat: 1,
    kind: 'stamp',
    text: 'Hide → failure',
    outcome: 'failure',
  },
  {
    id: 'narration',
    beat: 1,
    kind: 'narration',
    text: 'One two three four.',
    traceId: 'beat-1',
  },
  {
    id: 'line1',
    beat: 1,
    kind: 'dialogue',
    speaker: 'char:ilsa',
    text: 'A clue.',
    status: 'final',
  },
  {
    id: 'line2',
    beat: 1,
    kind: 'dialogue',
    speaker: 'char:brann',
    text: 'Leave that alone.',
    status: 'final',
  },
  { id: 'note', beat: 1, kind: 'note', text: 'Letter → your inventory' },
];
