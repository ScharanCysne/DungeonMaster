import { describe, expect, it } from 'vitest';
import { event, freeze, result, snapshot } from '../testing/fixtures';
import { applyServerMessage } from './reducer';
import { createInitialState } from './types';

const seeded = () => applyServerMessage(createInitialState(), snapshot);
describe('journal derivation', () => {
  it('formats witnessed check and attack stamps with world names', () => {
    const next = applyServerMessage(
      seeded(),
      result([
        event('CheckRolled', undefined, { seq: 1 }),
        event('AttackResolved', undefined, { seq: 2 }),
      ]),
    );
    const stamps = next.journal.entries.filter(
      (entry) => entry.kind === 'stamp',
    );
    expect(stamps.map((entry) => entry.text)).toEqual([
      'Kael · Perception 15 vs DC 15 → success',
      'Kael attacks Brann · 15 vs AC 15 → hit',
    ]);
    expect(stamps.map((entry) => entry.outcome)).toEqual([
      'success',
      'success',
    ]);
  });
  it('formats contested checks and never derives unlabelled stamps from rolls alone', () => {
    const roll = { expr: '1d20', rolls: [9], total: 9, outcome: 'success' };
    const next = applyServerMessage(seeded(), {
      ...result([
        event('CheckRolled', {
          kind: 'contested',
          checkId: 'opposed',
          actor: 'char:ilsa',
          skill: 'deception',
          target: 'char:brann',
          targetSkill: 'insight',
          reason: 'Distract him.',
          actorRoll: { ...roll, total: 17 },
          targetRoll: roll,
          winner: 'char:ilsa',
        }),
      ]),
      rolls: [{ expr: '1d20', rolls: [20], total: 20, outcome: 'success' }],
    });
    expect(
      next.journal.entries.filter((entry) => entry.kind === 'stamp'),
    ).toEqual([
      expect.objectContaining({
        text: 'Ilsa · Deception 17 vs Brann · Insight 9 → Ilsa wins',
      }),
    ]);
  });
  it('includes only the player intent, narration, resolved lines and supported event notes', () => {
    const next = applyServerMessage(
      seeded(),
      result([
        event(
          'IntentReceived',
          { text: 'Open the box.', selection: ['container:box'] },
          { seq: 1 },
        ),
        event(
          'IntentReceived',
          { text: 'Secret plan.', selection: [], say: 'A clue.' },
          { actor: 'char:ilsa', seq: 2 },
        ),
        event(
          'ItemTransferred',
          {
            itemId: 'item:quill',
            from: { kind: 'container', id: 'container:box' },
            to: { kind: 'character', id: 'char:player' },
            reason: 'pick_up',
            goldChanges: [],
          },
          { seq: 3 },
        ),
        event('NarrationCommitted', result().narration, { seq: 4 }),
        event('CriticRejected', undefined, { seq: 5 }),
      ]),
    );
    expect(
      next.journal.entries.filter((entry) => entry.kind === 'intent'),
    ).toEqual([
      expect.objectContaining({
        text: 'Open the box.',
        selection: ['container:box'],
      }),
    ]);
    expect(
      next.journal.entries.filter((entry) => entry.kind === 'narration'),
    ).toHaveLength(1);
    expect(next.journal.entries).toContainEqual(
      expect.objectContaining({ kind: 'note', text: 'Quill → your inventory' }),
    );
    expect(JSON.stringify(next.journal)).not.toContain('Secret plan');
    expect(JSON.stringify(next.journal)).not.toContain('dragon');
  });
  it('isolates ground truth and excludes private or unwitnessed events from journal and world', () => {
    const hidden = {
      ...snapshot.entities[0],
      id: 'char:hidden',
      name: 'Hidden stranger',
    };
    const created = event(
      'EntityCreated',
      { entity: hidden, edges: [] },
      { witnesses: ['char:ilsa'], seq: 1 },
    );
    const message = result([
      created,
      event('DamageApplied', undefined, { witnesses: ['char:ilsa'], seq: 2 }),
      event('CheckRolled', undefined, {
        private: true,
        actor: 'char:ilsa',
        seq: 3,
      }),
    ]);
    if (created.type !== 'EntityCreated')
      throw new Error('Expected entity fixture');
    message.groundTruth = { nodes: [created.payload.entity], edges: [] };
    const next = applyServerMessage(freeze(seeded()), freeze(message));
    expect(next.dev.groundTruth?.nodes[0]?.name).toBe('Hidden stranger');
    expect(next.world.entities['char:hidden']).toBeUndefined();
    expect(
      next.journal.entries.filter((entry) => entry.kind === 'stamp'),
    ).toHaveLength(0);
    expect(JSON.stringify(next.journal)).not.toContain('Hidden stranger');
    expect(next.world.entities['char:brann']).toMatchObject({ hp: 12 });
  });
  it('matches provisional dialogue once by speaker and exact text, striking omitted or changed lines', () => {
    let state = seeded();
    for (const [speaker, text] of [
      ['char:ilsa', 'A clue.'],
      ['char:ilsa', 'A clue.'],
      ['char:brann', 'A clue.'],
      ['char:ilsa', 'A clue!'],
    ] as const)
      state = applyServerMessage(state, {
        type: 'beat_progress',
        beat: 1,
        progress: { kind: 'peer_line', speaker, text },
      });
    const next = applyServerMessage(freeze(state), result());
    const lines = next.journal.entries.filter(
      (entry) => entry.kind === 'dialogue',
    );
    expect(lines.map((entry) => entry.status)).toEqual([
      'final',
      'struck',
      'struck',
      'struck',
    ]);
  });
});

it('finalises witnessed peer speech even when narration omits that line', () => {
  const state = applyServerMessage(seeded(), {
    type: 'beat_progress',
    beat: 1,
    progress: { kind: 'peer_line', speaker: 'char:ilsa', text: 'A clue.' },
  });
  const message = result([
    event(
      'IntentReceived',
      {
        text: 'Distract Brann.',
        selection: ['char:brann'],
        say: 'A clue.',
      },
      { actor: 'char:ilsa' },
    ),
  ]);
  message.narration.lines = [];
  const next = applyServerMessage(freeze(state), message);
  expect(
    next.journal.entries.filter((entry) => entry.kind === 'dialogue'),
  ).toEqual([expect.objectContaining({ text: 'A clue.', status: 'final' })]);
  expect(JSON.stringify(next.journal)).not.toContain('Distract Brann');
});
