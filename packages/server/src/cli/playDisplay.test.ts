import { expect, it } from 'vitest';
import type { BeatResult, GameEventOf } from '@dungeon/shared';
import { displayMessage } from './playDisplay.js';

const contest: GameEventOf<'CheckRolled'> = {
  v: 1,
  sessionId: 'test',
  beat: 1,
  seq: 1,
  traceId: 'beat-1',
  actor: 'char:ilsa',
  private: false,
  witnesses: ['char:kael'],
  createdBy: 'engine',
  type: 'CheckRolled',
  payload: {
    kind: 'contested',
    checkId: 'check-1',
    actor: 'char:ilsa',
    skill: 'sleight_of_hand',
    target: 'char:brann',
    targetSkill: 'perception',
    reason: 'Lift a key.',
    winner: 'char:ilsa',
    actorRoll: {
      expr: '1d20+6',
      rolls: [10],
      total: 16,
      dc: 10,
      outcome: 'success',
    },
    targetRoll: {
      expr: '1d20',
      rolls: [10],
      total: 10,
      dc: 16,
      outcome: 'failure',
    },
  },
};
const attack: GameEventOf<'AttackResolved'> = {
  ...contest,
  seq: 2,
  type: 'AttackResolved',
  payload: {
    attacker: 'char:kael',
    target: 'char:brann',
    hit: false,
    critical: false,
    roll: { expr: '1d20', rolls: [2], total: 2, dc: 13, outcome: 'failure' },
  },
};
const result: BeatResult = {
  type: 'beat_result',
  beat: 1,
  traceId: 'beat-1',
  events: [contest, attack],
  rolls: [attack.payload.roll, attack.payload.roll, attack.payload.roll],
  narration: {
    text: 'You wait.',
    lines: [{ speaker: 'char:ilsa', text: 'Listen.' }],
  },
};

it('prints one line per check event, in event order before narration and dialogue', () => {
  const lines: string[] = [];
  const names = new Map([
    ['char:ilsa', 'Ilsa'],
    ['char:brann', 'Brann'],
    ['char:kael', 'Kael'],
  ]);
  displayMessage(
    result,
    (text) => lines.push(text),
    (id) => names.get(id),
  );
  expect(lines).toEqual([
    'Ilsa · Sleight of Hand 16 vs Brann · Perception 10 → Ilsa wins',
    'Kael attacks Brann · 2 vs AC 13 → miss',
    'You wait.',
    'char:ilsa: Listen.',
  ]);
});

it('falls back to ids without a visible-name lookup', () => {
  const lines: string[] = [];
  displayMessage(result, (text) => lines.push(text));
  expect(lines[0]).toBe(
    'char:ilsa · Sleight of Hand 16 vs char:brann · Perception 10 → char:ilsa wins',
  );
});

it('ignores legacy rolls and unrelated committed events', () => {
  const lines: string[] = [];
  const event: GameEventOf<'NarrationCommitted'> = {
    ...contest,
    type: 'NarrationCommitted',
    payload: result.narration,
  };
  displayMessage({ ...result, events: [event] }, (text) => lines.push(text));
  expect(lines).toEqual(['You wait.', 'char:ilsa: Listen.']);
});

it('keeps provisional peer lines and leaves status rendering to the renderer', () => {
  const lines: string[] = [];
  const write = (text: string) => lines.push(text);
  displayMessage(
    {
      type: 'beat_progress',
      beat: 1,
      progress: { kind: 'status', phase: 'dm', toolCalls: 3 },
    },
    write,
  );
  displayMessage(
    {
      type: 'beat_progress',
      beat: 1,
      progress: { kind: 'peer_line', speaker: 'char:ilsa', text: 'Listen.' },
    },
    write,
  );
  expect(lines).toEqual(['(provisional) char:ilsa: Listen.']);
});
