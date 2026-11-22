import { expect, it } from 'vitest';
import { entry, fixture, receipt, rejects, value } from './testing/fixtures.js';

it('hide consumes a successful stealth receipt and emits EntityHidden', () => {
  const engine = fixture();
  const checkId = receipt(engine);
  const result = engine.hide({ actor: 'char:player', checkId });
  expect({
    result,
    hidden: engine.state.characters.get('char:player')?.hidden,
    spent: engine.state.receipts.get(checkId)?.spent,
  }).toMatchObject({
    result: {
      ok: true,
      events: [{ type: 'EntityHidden', payload: { entityId: 'char:player' } }],
      facts: ['Player is hidden.'],
    },
    hidden: true,
    spent: true,
  });
});

it('hide rejects an unknown receipt without changes', () => {
  const engine = fixture();
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId: 'missing-check' }),
    'RECEIPT_INVALID',
    'missing-check',
  );
});

it('hide rejects a receipt from another beat without changes', () => {
  const engine = fixture();
  const checkId = receipt(engine);
  engine.beginBeat(2);
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId }),
    'RECEIPT_INVALID',
    checkId,
  );
});

it('hide rejects another actor’s receipt without changes', () => {
  const engine = fixture();
  const checkId = receipt(engine, 'stealth', 'char:peer');
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId }),
    'RECEIPT_WRONG_ACTOR',
    'char:player',
  );
});

it('hide rejects a perception receipt without changes', () => {
  const engine = fixture();
  const checkId = receipt(engine, 'perception');
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId }),
    'RECEIPT_WRONG_SKILL',
    checkId,
  );
});

it('hide rejects a failed check without changes', () => {
  const engine = fixture((seed) => {
    const actor = entry(seed.characters, 'char:player');
    actor.abilities.dex = 3;
    actor.proficiencies = [];
  });
  const check = value(
    engine.skill_check({
      actor: 'char:player',
      skill: 'stealth',
      dc: 25,
      advantage: 'none',
      reason: 'Impossible hiding spot',
    }),
  );
  expect(check.outcome).toBe('failure');
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId: check.checkId }),
    'RECEIPT_FAILED',
    check.checkId,
  );
});

it('hide rejects an already-spent receipt without changes', () => {
  const engine = fixture();
  const checkId = receipt(engine);
  value(engine.hide({ actor: 'char:player', checkId }));
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId }),
    'RECEIPT_SPENT',
    checkId,
  );
});

it('hide rejects an unconscious actor without changes', () => {
  const engine = fixture();
  const checkId = receipt(engine);
  value(
    engine.apply_damage({
      target: 'char:player',
      dice: '1d4+100',
      cause: 'fall',
    }),
  );
  rejects(
    engine,
    () => engine.hide({ actor: 'char:player', checkId }),
    'ACTOR_UNCONSCIOUS',
    'char:player',
  );
});
