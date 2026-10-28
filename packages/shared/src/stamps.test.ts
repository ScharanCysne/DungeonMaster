import { expect, it } from 'vitest';
import { abilitySchema, skillSchema } from './primitives.js';
import type { CheckRolledPayload, EventPayload } from './event-payloads.js';
import { formatRollStamp } from './index.js';

const names = new Map([
  ['char:kael', 'Kael'],
  ['char:ilsa', 'Ilsa'],
  ['char:brann', 'Brann'],
  ['char:doran', 'Doran'],
  ['char:stranger', 'the stranger'],
]);
const lookup = (id: string) => names.get(id);
const skill: CheckRolledPayload = {
  kind: 'skill',
  checkId: 'check-1',
  actor: 'char:kael',
  skill: 'investigation',
  dc: 10,
  advantage: 'none',
  reason: 'Find a clue.',
  roll: { expr: '1d20+4', rolls: [10], total: 14, dc: 10, outcome: 'success' },
};
const contest: CheckRolledPayload = {
  kind: 'contested',
  checkId: 'check-2',
  actor: 'char:ilsa',
  skill: 'sleight_of_hand',
  target: 'char:brann',
  targetSkill: 'perception',
  reason: 'Lift the key.',
  actorRoll: {
    expr: '1d20+6',
    rolls: [10],
    total: 16,
    dc: 10,
    outcome: 'success',
  },
  targetRoll: {
    expr: '1d20+2',
    rolls: [8],
    total: 10,
    dc: 16,
    outcome: 'failure',
  },
  winner: 'char:ilsa',
};
const attack: EventPayload<'AttackResolved'> = {
  attacker: 'char:doran',
  target: 'char:stranger',
  roll: { expr: '1d20+4', rolls: [13], total: 17, dc: 13, outcome: 'success' },
  hit: true,
  critical: false,
};

it('identifies a skill check using the payload DC and display name', () => {
  expect(
    formatRollStamp({ ...skill, roll: { ...skill.roll, dc: 25 } }, lookup),
  ).toBe('Kael · Investigation 14 vs DC 10 → success');
});

it.each([
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
])('formats skill %s', (label) => {
  const name = skillSchema.parse(label.toLowerCase().replaceAll(' ', '_'));
  expect(formatRollStamp({ ...skill, skill: name }, lookup)).toBe(
    `Kael · ${label} 14 vs DC 10 → success`,
  );
});

it.each(abilitySchema.options)('formats ability %s in uppercase', (ability) => {
  const check = { ...skill };
  delete check.skill;
  expect(formatRollStamp({ ...check, ability }, lookup)).toBe(
    `Kael · ${ability.toUpperCase()} 14 vs DC 10 → success`,
  );
});

it.each(['failure', 'tie'] as const)(
  'preserves a check outcome of %s',
  (outcome) => {
    expect(
      formatRollStamp({ ...skill, roll: { ...skill.roll, outcome } }, lookup),
    ).toBe(`Kael · Investigation 14 vs DC 10 → ${outcome}`);
  },
);

it.each(['advantage', 'disadvantage'] as const)(
  'shows both dice for %s',
  (advantage) => {
    expect(
      formatRollStamp(
        { ...skill, advantage, roll: { ...skill.roll, rolls: [15, 9] } },
        lookup,
      ),
    ).toBe(`Kael · Investigation 14 vs DC 10 → success (${advantage}: 15, 9)`);
  },
);

it('omits absent advantage dice without inventing them', () => {
  expect(
    formatRollStamp(
      { ...skill, advantage: 'advantage', roll: { ...skill.roll, rolls: [] } },
      lookup,
    ),
  ).toBe('Kael · Investigation 14 vs DC 10 → success');
});

it('combines a contest into one line without labelling the opposing totals DC', () => {
  expect(formatRollStamp(contest, lookup)).toBe(
    'Ilsa · Sleight of Hand 16 vs Brann · Perception 10 → Ilsa wins',
  );
});

it('names the target when the actor loses a contest', () => {
  expect(
    formatRollStamp(
      {
        ...contest,
        winner: 'char:brann',
        targetRoll: { ...contest.targetRoll, total: 19 },
      },
      lookup,
    ),
  ).toBe('Ilsa · Sleight of Hand 16 vs Brann · Perception 19 → Brann wins');
});

it('reports a contested tie', () => {
  expect(
    formatRollStamp(
      {
        ...contest,
        winner: null,
        targetRoll: { ...contest.targetRoll, total: 16 },
      },
      lookup,
    ),
  ).toBe('Ilsa · Sleight of Hand 16 vs Brann · Perception 16 → tie');
});

it.each([
  [true, false, 'hit'],
  [true, true, 'hit (critical)'],
  [false, false, 'miss'],
] as const)('formats attack hit=%s critical=%s', (hit, critical, outcome) => {
  expect(formatRollStamp({ ...attack, hit, critical }, lookup)).toBe(
    `Doran attacks the stranger · 17 vs AC 13 → ${outcome}`,
  );
});

it('uses the attack hit flag even when the roll outcome differs', () => {
  expect(formatRollStamp({ ...attack, hit: false }, lookup)).toBe(
    'Doran attacks the stranger · 17 vs AC 13 → miss',
  );
});

it('omits missing AC without inventing a defence', () => {
  const roll = { ...attack.roll };
  delete roll.dc;
  expect(formatRollStamp({ ...attack, roll }, lookup)).toBe(
    'Doran attacks the stranger · 17 → hit',
  );
});

it('falls back to ids for every unknown participant', () => {
  const unknown = () => undefined;
  expect(formatRollStamp(skill, unknown)).toBe(
    'char:kael · Investigation 14 vs DC 10 → success',
  );
  expect(formatRollStamp(contest, unknown)).toBe(
    'char:ilsa · Sleight of Hand 16 vs char:brann · Perception 10 → char:ilsa wins',
  );
  expect(formatRollStamp(attack, unknown)).toBe(
    'char:doran attacks char:stranger · 17 vs AC 13 → hit',
  );
});

it('does not mutate a payload', () => {
  const original = JSON.stringify(contest);
  formatRollStamp(contest, lookup);
  expect(JSON.stringify(contest)).toBe(original);
});
