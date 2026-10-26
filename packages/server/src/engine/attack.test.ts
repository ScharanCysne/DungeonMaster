import { describe, expect, it } from 'vitest';
import { beatSeed, rollDice } from './index.js';
import { diceSeed, duel, passTo } from './testing/combat.js';
import { entry, rejects, value } from './testing/fixtures.js';

describe('attack', () => {
  it.each([
    [17, true],
    [18, false],
  ])('compares a fixed attack total to AC %i', (ac, hit) => {
    const engine = duel(
      (seed) => {
        entry(seed.characters, 'char:peer').ac = ac;
      },
      diceSeed(20, 1, 10),
    );
    const result = value(
      engine.attack({ attacker: 'char:player', target: 'char:peer' }),
    );
    expect(result).toMatchObject({
      roll: {
        rolls: [10],
        total: 17,
        dc: ac,
        outcome: hit ? 'success' : 'failure',
      },
      hit,
      critical: false,
    });
    expect(
      engine.collectEvents().filter((event) => event.type === 'DamageApplied'),
    ).toHaveLength(hit ? 1 : 0);
    expect(engine.state.characters.get('char:peer')?.hp).toBe(hit ? 6 : 12);
    expect(engine.state.combat?.turn).toBe(1);
  });

  it('natural 1 misses even when the maximum legal bonus exceeds AC', () => {
    const engine = duel(
      (seed) => {
        entry(seed.characters, 'char:peer').ac = 1;
      },
      diceSeed(20, 1, 1),
    );
    expect(
      value(engine.attack({ attacker: 'char:player', target: 'char:peer' })),
    ).toMatchObject({
      roll: { rolls: [1], total: 8, dc: 1 },
      hit: false,
      critical: false,
    });
    expect(engine.state.characters.get('char:peer')?.hp).toBe(12);
  });

  it('natural 20 always hits and rolls all weapon dice twice with each modifier only once', () => {
    const sessionSeed = diceSeed(20, 1, 20);
    const engine = duel((seed) => {
      entry(seed.characters, 'char:peer').ac = 999;
      entry(seed.items, 'item:rock').damage = '2d6+3';
    }, sessionSeed);
    const expected = { rngState: beatSeed(sessionSeed, 1, 0) };
    for (let i = 0; i < 3; i++) rollDice(expected, '1d20');
    const rolls = [
      ...rollDice(expected, '2d6').rolls,
      ...rollDice(expected, '2d6').rolls,
    ];
    expect(
      value(
        engine.attack({
          attacker: 'char:player',
          target: 'char:peer',
          weaponId: 'item:rock',
        }),
      ),
    ).toMatchObject({
      hit: true,
      critical: true,
      roll: { rolls: [20], dc: 999 },
    });
    expect(
      engine.collectEvents().find((event) => event.type === 'DamageApplied')
        ?.payload,
    ).toMatchObject({
      amount: rolls.reduce((sum, die) => sum + die, 8),
      roll: { expr: '4d6+8', rolls },
    });
    expect(engine.state.rngState).toBe(expected.rngState);
  });

  it('can attack an unconscious character without adding them to initiative', () => {
    const engine = duel(
      (seed) => {
        const peer = entry(seed.characters, 'char:peer');
        peer.hp = 0;
        peer.conscious = false;
      },
      diceSeed(10, 10),
    );
    expect(
      value(engine.attack({ attacker: 'char:player', target: 'char:peer' }))
        .hit,
    ).toBe(true);
    expect(engine.state.combat).toMatchObject({
      order: ['char:player'],
      turn: 0,
      round: 2,
    });
    expect(engine.state.characters.get('char:peer')).toMatchObject({
      hp: 0,
      conscious: false,
    });
  });

  it('rejects invalid weapon dice without starting combat or consuming RNG', () => {
    const engine = duel((seed) => {
      entry(seed.items, 'item:rock').damage = '1d3';
    });
    rejects(
      engine,
      () =>
        engine.attack({
          attacker: 'char:player',
          target: 'char:peer',
          weaponId: 'item:rock',
        }),
      'INVALID_DICE',
    );
  });

  it('rejects unsafe damage before starting combat and preserves attack RNG and turns during combat', () => {
    const engine = duel(
      (seed) => {
        entry(seed.items, 'item:rock').damage = '1d4+9007199254740987';
        entry(seed.characters, 'char:peer').ac = 0;
      },
      diceSeed(1, 20, 10),
    );
    const attack = () =>
      engine.attack({
        attacker: 'char:player',
        target: 'char:peer',
        weaponId: 'item:rock',
      });
    rejects(engine, attack, 'INVALID_DICE');
    engine.attack({ attacker: 'char:player', target: 'char:peer' });
    passTo(engine, 'char:player');
    rejects(engine, attack, 'INVALID_DICE');
    expect(
      value(engine.attack({ attacker: 'char:player', target: 'char:peer' }))
        .roll.rolls,
    ).toEqual([10]);
  });
});
