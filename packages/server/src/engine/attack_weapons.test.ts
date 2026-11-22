import { describe, expect, it } from 'vitest';
import { eventPayloadSchemas } from '@dungeon/shared';
import { beatSeed, rollDice } from './index.js';
import { diceSeed, duel } from './testing/combat.js';
import { entry, value } from './testing/fixtures.js';

describe('attack weapons and unarmed damage', () => {
  it.each([
    { tags: [], str: 18, dex: 20, modifier: 4 },
    { tags: ['ranged'], str: 18, dex: 20, modifier: 5 },
    { tags: ['finesse'], str: 18, dex: 20, modifier: 5 },
    { tags: ['finesse'], str: 20, dex: 18, modifier: 5 },
    { tags: ['ranged', 'finesse'], str: 20, dex: 18, modifier: 4 },
  ])(
    'selects the attack and damage ability for $tags, STR $str, DEX $dex',
    ({ tags, str, dex, modifier }) => {
      const engine = duel(
        (seed) => {
          const player = entry(seed.characters, 'char:player');
          player.abilities.str = str;
          player.abilities.dex = dex;
          player.proficiencies = [];
          Object.assign(entry(seed.items, 'item:rock'), {
            damage: '1d6',
            tags,
          });
        },
        diceSeed(20, 1, 10),
      );
      expect(
        value(
          engine.attack({
            attacker: 'char:player',
            target: 'char:peer',
            weaponId: 'item:rock',
          }),
        ).roll.total,
      ).toBe(12 + modifier);
      const damage = engine
        .collectEvents()
        .find((event) => event.type === 'DamageApplied');
      expect(damage?.payload.roll.expr).toBe(`1d6+${modifier}`);
      expect(damage?.payload.amount).toBe(
        (damage?.payload.roll.rolls[0] ?? 0) + modifier,
      );
    },
  );

  it('uses the equipped main hand weapon and records its id', () => {
    const engine = duel(
      (seed) => {
        entry(seed.items, 'item:rock').damage = '1d6';
      },
      diceSeed(20, 1, 10),
    );
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    expect(
      value(engine.attack({ attacker: 'char:player', target: 'char:peer' }))
        .weaponId,
    ).toBe('item:rock');
  });

  it('prefers an explicit carried weapon over the equipped weapon', () => {
    const engine = duel(
      (seed) => {
        entry(seed.items, 'item:rock').damage = '1d6';
        entry(seed.items, 'item:key').damage = '1d4';
      },
      diceSeed(20, 1, 10),
    );
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    expect(
      value(
        engine.attack({
          attacker: 'char:player',
          target: 'char:peer',
          weaponId: 'item:key',
        }),
      ).weaponId,
    ).toBe('item:key');
  });

  it.each([3, 20])(
    'falls back to unarmed with STR %i, clamps damage and consumes no damage RNG',
    (str) => {
      const sessionSeed = diceSeed(20, 1, 10);
      const engine = duel((seed) => {
        entry(seed.characters, 'char:player').abilities.str = str;
        entry(seed.characters, 'char:peer').ac = 0;
      }, sessionSeed);
      value(
        engine.equip({
          actor: 'char:player',
          item: 'item:key',
          slot: 'main_hand',
        }),
      );
      const result = value(
        engine.attack({ attacker: 'char:player', target: 'char:peer' }),
      );
      expect(result.weaponId).toBeUndefined();
      const damage = engine
        .collectEvents()
        .find((event) => event.type === 'DamageApplied');
      expect(damage?.payload).toMatchObject({
        amount: str === 3 ? 1 : 6,
        roll: { rolls: [], total: str === 3 ? -3 : 6 },
      });
      expect(
        eventPayloadSchemas.DamageApplied.safeParse(damage?.payload).success,
      ).toBe(true);
      const expected = { rngState: beatSeed(sessionSeed, 1, 0) };
      for (let i = 0; i < 3; i++) rollDice(expected, '1d20');
      expect(engine.state.rngState).toBe(expected.rngState);
    },
  );

  it('unarmed criticals have no dice to double', () => {
    const engine = duel(() => {}, diceSeed(20, 1, 20));
    expect(
      value(engine.attack({ attacker: 'char:player', target: 'char:peer' }))
        .critical,
    ).toBe(true);
    expect(
      engine.collectEvents().find((event) => event.type === 'DamageApplied')
        ?.payload,
    ).toMatchObject({ amount: 6, roll: { rolls: [] } });
  });

  it('clamps negative weapon damage to one without changing the recorded roll total', () => {
    const engine = duel(
      (seed) => {
        entry(seed.items, 'item:rock').damage = '1d4-100';
      },
      diceSeed(20, 1, 10),
    );
    value(
      engine.attack({
        attacker: 'char:player',
        target: 'char:peer',
        weaponId: 'item:rock',
      }),
    );
    const damage = engine
      .collectEvents()
      .find((event) => event.type === 'DamageApplied');
    expect(damage?.payload.amount).toBe(1);
    expect(damage?.payload.roll.total).toBeLessThan(0);
  });
});
