import { describe, expect, it } from 'vitest';
import { gameEventSchema } from '@dungeon/shared';
import { eventPayloads } from '../../../shared/src/testing/event-fixtures.js';
import { envelope } from '../../../shared/src/testing/fixtures.js';
import { Engine, reduceEvent } from './index.js';
import { gridFixture, seedFixture } from './testing/fixtures.js';

const seed = gameEventSchema.parse({
  ...envelope,
  beat: 0,
  type: 'SeedLoaded',
  payload: { seed: seedFixture(), rngSeed: 'fixture' },
});
const noops = [
  'BeatStarted',
  'BeatCommitted',
  'IntentReceived',
  'CheckRolled',
  'AttackResolved',
  'FactCreated',
  'FactLearned',
  'AttitudeChanged',
  'QuestStatusChanged',
  'NarrationCommitted',
  'CriticRejected',
  'RecapUpdated',
  'EpisodeEnded',
];

describe('pure replay', () => {
  it.each(
    Object.entries(eventPayloads).filter(([type]) => noops.includes(type)),
  )('%s only advances the committed beat', (type, payload) => {
    const state = new Engine(seedFixture(), gridFixture(), 'fixture').state;
    const before = structuredClone(state);
    const next = reduceEvent(
      state,
      gameEventSchema.parse({ ...envelope, type, payload }),
      gridFixture(),
    );
    expect(next).toEqual({ ...before, beat: 1 });
    expect(state).toEqual(before);
  });
  it('requires SeedLoaded and resets pending commands, receipts and rollback baseline', () => {
    expect(() => Engine.fromLog([], gridFixture())).toThrow('SeedLoaded');
    const moved = gameEventSchema.parse({
      ...envelope,
      type: 'EntityMoved',
      payload: eventPayloads.EntityMoved,
    });
    expect(() => Engine.fromLog([moved], gridFixture())).toThrow('SeedLoaded');
    const engine = Engine.fromLog([seed, moved], gridFixture());
    const restored = engine.snapshot();
    expect(engine.collectEvents()).toEqual([]);
    expect(engine.state.receipts.size).toBe(0);
    engine.move({ actor: 'char:player', to: 'loc:other' });
    engine.rollback();
    expect(engine.snapshot()).toEqual(restored);
  });
  it('does not share mutable record or grid data with its state', () => {
    const grid = gridFixture();
    const engine = Engine.fromLog([seed], grid);
    const before = engine.state;
    grid.walkable[0]?.fill(false);
    const state = engine.state;
    state.characters.clear();
    expect(engine.state).toEqual(before);
  });
});
