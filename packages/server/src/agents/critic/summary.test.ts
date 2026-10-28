import { expect, it } from 'vitest';
import type { LogDraft } from '../../ontology/eventLog.js';
import { neutralSummary } from './summary.js';

const opened: LogDraft = {
  type: 'ContainerOpened',
  actor: 'char:player',
  private: false,
  witnesses: ['char:player'],
  payload: {
    containerId: 'container:secret-vault',
    revealed: ['item:hidden-gem'],
  },
};

it('contains only player-witnessed events, even when private flags differ', () => {
  const events: LogDraft[] = [
    { ...opened, witnesses: ['char:peer'] },
    { ...opened, private: true },
    {
      type: 'EntityRevealed',
      actor: 'char:peer',
      private: false,
      witnesses: ['char:peer'],
      payload: { entityId: 'item:secret' },
    },
  ];
  const summary = neutralSummary(events, 'char:player');
  expect(summary).toEqual({ text: 'You see a container open.', lines: [] });
  expect(summary.text).not.toContain('secret');
  expect(summary.text).not.toContain('hidden-gem');
});

it('keeps chronological second-person event sentences and omits other minds', () => {
  const events: LogDraft[] = [
    opened,
    {
      type: 'FactLearned',
      actor: 'char:peer',
      private: true,
      witnesses: ['char:player'],
      payload: {
        characterId: 'char:peer',
        factId: 'fact:secret',
        since: 1,
        source: 'told',
        confidence: 1,
      },
    },
    {
      type: 'EntityRevealed',
      actor: 'char:player',
      private: false,
      witnesses: ['char:player'],
      payload: { entityId: 'item:new' },
    },
  ];
  expect(neutralSummary(events, 'char:player').text).toBe(
    'You see a container open. You notice something previously concealed.',
  );
});

it('never copies free text, dialogue or a rejected narration into the fallback', () => {
  const events: LogDraft[] = [
    {
      type: 'NarrationCommitted',
      actor: null,
      private: false,
      witnesses: ['char:player'],
      payload: {
        text: 'Leaked unknown information.',
        lines: [{ speaker: 'char:npc', text: 'Leaked dialogue.' }],
      },
    },
    {
      type: 'AttitudeChanged',
      actor: 'char:peer',
      private: true,
      witnesses: ['char:player'],
      payload: {
        from: 'char:peer',
        to: 'char:player',
        value: 1,
        delta: 1,
        reason: 'Private thoughts.',
      },
    },
  ];
  expect(neutralSummary(events, 'char:player')).toEqual({
    text: 'You notice no further change.',
    lines: [],
  });
});

it('stops at a whole sentence and never exceeds 120 words', () => {
  const summary = neutralSummary(
    Array.from({ length: 100 }, () => opened),
    'char:player',
  );
  expect(summary.text.split(/\s/u)).toHaveLength(120);
  expect(summary.text.endsWith('.')).toBe(true);
  expect(summary.lines).toEqual([]);
});

it('empty and entirely unwitnessed beats have the same neutral fallback', () => {
  expect(neutralSummary([], 'char:player')).toEqual(
    neutralSummary([{ ...opened, witnesses: [] }], 'char:player'),
  );
});

it('does not claim injury or recovery for zero damage or healing', () => {
  const events: LogDraft[] = [
    {
      type: 'Healed',
      actor: 'char:peer',
      private: false,
      witnesses: ['char:player'],
      payload: {
        target: 'char:player',
        amount: 0,
        hp: 20,
        conscious: true,
        source: 'rest',
        roll: { expr: '0', rolls: [], total: 0, outcome: 'success' },
      },
    },
  ];
  events.push({
    type: 'DamageApplied',
    actor: null,
    private: false,
    witnesses: ['char:player'],
    payload: {
      target: 'char:player',
      amount: 0,
      hp: 20,
      conscious: true,
      cause: 'No damage.',
      roll: { expr: '0', rolls: [], total: 0, outcome: 'failure' },
    },
  });
  expect(neutralSummary(events, 'char:player').text).toBe(
    'You notice no further change.',
  );
});
