import { describe, expect, it } from 'vitest';
import { diceSeed, duel, startOnPeer } from './testing/combat.js';
import { entry, rejects, value } from './testing/fixtures.js';

describe('combat lifecycle', () => {
  it.each([diceSeed(1, 20), diceSeed(20, 1, 10)])(
    'rolls back the separately committed start and replays identical initiative and attack for %s',
    (sessionSeed) => {
      const engine = duel(() => {}, sessionSeed);
      const initial = engine.snapshot();
      const attack = () =>
        engine.attack({ attacker: 'char:player', target: 'char:peer' });
      const result = attack();
      const after = engine.snapshot();
      engine.rollback();
      expect(engine.snapshot()).toEqual(initial);
      expect(attack()).toEqual(result);
      expect(engine.snapshot()).toEqual(after);
    },
  );

  it('restores mid-combat order, cursor, round, used movement, witnesses and RNG exactly', () => {
    const engine = duel(
      (seed) => {
        for (const id of ['char:player', 'char:peer']) {
          const character = entry(seed.characters, id);
          character.hp = character.maxHp = 100;
        }
        entry(seed.items, 'item:rock').damage = '2d6';
        entry(seed.items, 'item:rock').holder = {
          kind: 'character',
          id: 'char:peer',
        };
      },
      diceSeed(1, 20),
    );
    startOnPeer(engine);
    value(engine.move({ actor: 'char:peer', to: 'container:box' }));
    engine.beginBeat(2, 1);
    const before = engine.snapshot();
    const brawl = () => {
      const results = [
        engine.attack({
          attacker: 'char:peer',
          target: 'char:player',
          weaponId: 'item:rock',
        }),
        engine.pass_turn({ actor: 'char:player' }),
        engine.move({ actor: 'char:peer', to: 'loc:room' }),
        engine.attack({
          attacker: 'char:peer',
          target: 'char:player',
          weaponId: 'item:rock',
        }),
        engine.end_combat({ reason: 'surrendered' }),
      ];
      for (const result of results)
        if (!result.ok) throw new Error(result.error.message);
      return results;
    };
    const results = brawl();
    const after = engine.snapshot();
    engine.rollback();
    expect(engine.snapshot()).toEqual(before);
    rejects(
      engine,
      () => engine.move({ actor: 'char:peer', to: 'loc:room' }),
      'MOVE_ALREADY_USED',
    );
    expect(brawl()).toEqual(results);
    expect(engine.snapshot()).toEqual(after);
  });

  it('preserves combat and movement allowance across beats and retry setup', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    value(engine.move({ actor: 'char:peer', to: 'loc:room' }));
    const combat = engine.state.combat;
    engine.beginBeat(2);
    expect(engine.state.combat).toEqual(combat);
    value(engine.pass_turn({ actor: 'char:peer' }));
    engine.rollback();
    engine.beginBeat(2, 1);
    expect(engine.state.combat).toEqual(combat);
    rejects(
      engine,
      () => engine.move({ actor: 'char:peer', to: 'loc:room' }),
      'MOVE_ALREADY_USED',
    );
  });

  it('detaches nested combat state and initiative rolls in public snapshots and drafts', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    const before = engine.snapshot();
    engine.state.combat?.order.reverse();
    const snapshot = engine.snapshot();
    if (snapshot.state.combat) {
      snapshot.state.combat.round = 99;
      snapshot.state.combat.moved = true;
    }
    const event = engine
      .collectEvents()
      .find((candidate) => candidate.type === 'CombatStarted');
    event?.payload.order.reverse();
    event?.payload.initiative[0]?.roll.rolls.push(99);
    expect(engine.snapshot()).toEqual(before);
  });
});
