import { describe, expect, it } from 'vitest';
import { abilityModifier, skillAbilities } from './index.js';
import { entry, fixture, rejects, value } from './testing/fixtures.js';

describe('checks', () => {
  it.each([
    [3, -4],
    [4, -3],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [19, 4],
    [20, 5],
  ])('maps ability score %i to modifier %i', (score, modifier) => {
    expect(abilityModifier(score)).toBe(modifier);
  });
  it('maps all eighteen skills to their standard abilities', () => {
    expect(skillAbilities).toEqual({
      acrobatics: 'dex',
      animal_handling: 'wis',
      arcana: 'int',
      athletics: 'str',
      deception: 'cha',
      history: 'int',
      insight: 'wis',
      intimidation: 'cha',
      investigation: 'int',
      medicine: 'wis',
      nature: 'int',
      perception: 'wis',
      performance: 'cha',
      persuasion: 'cha',
      religion: 'int',
      sleight_of_hand: 'dex',
      stealth: 'dex',
      survival: 'wis',
    });
  });
  it.each(['advantage', 'disadvantage'] as const)(
    'records both dice and keeps the correct die with %s',
    (advantage) => {
      const engine = fixture();
      const result = value(
        engine.skill_check({
          actor: 'char:player',
          skill: 'stealth',
          dc: 5,
          advantage,
          reason: '',
        }),
      );
      expect({ count: result.roll.rolls.length, total: result.total }).toEqual({
        count: 2,
        total:
          (advantage === 'advantage'
            ? Math.max(...result.roll.rolls)
            : Math.min(...result.roll.rolls)) + 7,
      });
    },
  );
  it('adds exactly two for a proficient skill', () => {
    const check = (proficient: boolean) =>
      value(
        fixture((seed) => {
          entry(seed.characters, 'char:player').proficiencies = proficient
            ? ['stealth']
            : [];
        }).skill_check({
          actor: 'char:player',
          skill: 'stealth',
          dc: 5,
          advantage: 'none',
          reason: '',
        }),
      );
    expect(check(true).total - check(false).total).toBe(2);
  });
  it('uses the chosen ability without skill proficiency', () => {
    const result = value(
      fixture().skill_check({
        actor: 'char:player',
        ability: 'str',
        dc: 5,
        advantage: 'none',
        reason: '',
      }),
    );
    expect(result.total).toBe(Math.max(...result.roll.rolls) + 5);
  });
  it.each([5, 25] as const)('compares a skill total against DC %i', (dc) => {
    const result = value(
      fixture().skill_check({
        actor: 'char:player',
        skill: 'stealth',
        dc,
        advantage: 'none',
        reason: '',
      }),
    );
    expect(result.outcome).toBe(result.total >= dc ? 'success' : 'failure');
  });
  it('succeeds when total exactly equals DC', () => {
    const engine = fixture();
    const found = Array.from({ length: 100 }, () =>
      value(
        engine.skill_check({
          actor: 'char:player',
          skill: 'stealth',
          dc: 10,
          advantage: 'none',
          reason: '',
        }),
      ),
    ).find((check) => check.total === 10);
    expect(found?.outcome).toBe('success');
  });
  it('emits a shared check payload and a readable fact', () => {
    const result = fixture().skill_check({
      actor: 'char:player',
      skill: 'stealth',
      dc: 5,
      advantage: 'none',
      reason: 'sneak',
    });
    expect(result).toMatchObject({
      ok: true,
      events: [
        { type: 'CheckRolled', payload: { kind: 'skill', reason: 'sneak' } },
      ],
      facts: [expect.stringContaining('Player rolled')],
    });
  });
  it('rejects a missing check actor without changes', () => {
    const engine = fixture();
    rejects(
      engine,
      () =>
        engine.skill_check({
          actor: 'char:missing',
          skill: 'stealth',
          dc: 5,
          advantage: 'none',
          reason: '',
        }),
      'NO_SUCH_ENTITY',
      'char:missing',
    );
  });
  it('rejects an unconscious check actor without changes', () => {
    const engine = fixture((seed) => {
      entry(seed.characters, 'char:player').conscious = false;
    });
    rejects(
      engine,
      () =>
        engine.skill_check({
          actor: 'char:player',
          ability: 'dex',
          dc: 5,
          advantage: 'none',
          reason: '',
        }),
      'ACTOR_UNCONSCIOUS',
      'char:player',
    );
  });
  it('records both opposed rolls and the winning actor in a receipt', () => {
    const engine = fixture();
    const result = value(
      engine.contested_check({
        actor: 'char:player',
        skill: 'stealth',
        target: 'char:seller',
        targetSkill: 'perception',
        reason: '',
      }),
    );
    expect(engine.state.receipts.get(result.checkId)).toMatchObject({
      actor: 'char:player',
      total: result.actorRoll.total,
      winner: result.winner,
      outcome: result.actorRoll.outcome,
    });
  });
  it('gives a tied contest outcome tie with no winner', () => {
    const engine = fixture();
    const tied = Array.from({ length: 200 }, () =>
      value(
        engine.contested_check({
          actor: 'char:player',
          skill: 'stealth',
          target: 'char:seller',
          targetSkill: 'perception',
          reason: '',
        }),
      ),
    ).find((check) => check.winner === null);
    expect(tied).toMatchObject({
      winner: null,
      actorRoll: { outcome: 'tie' },
      targetRoll: { outcome: 'tie' },
    });
  });
  it.each(['char:player', 'char:seller'] as const)(
    'rejects a contest with unconscious %s without changes',
    (id) => {
      const engine = fixture((seed) => {
        entry(seed.characters, id).conscious = false;
      });
      rejects(
        engine,
        () =>
          engine.contested_check({
            actor: 'char:player',
            skill: 'stealth',
            target: 'char:seller',
            targetSkill: 'perception',
            reason: '',
          }),
        'ACTOR_UNCONSCIOUS',
        id,
      );
    },
  );
  it.each([
    ['char:missing', 'char:seller', 'NO_SUCH_ENTITY'],
    ['char:player', 'char:missing', 'NO_SUCH_ENTITY'],
    ['char:player', 'char:other', 'NOT_IN_SAME_ROOM'],
    ['char:player', 'char:player', 'INVALID_TARGET'],
  ] as const)(
    'rejects contest %s against %s without changes',
    (actor, target, code) => {
      const engine = fixture();
      rejects(
        engine,
        () =>
          engine.contested_check({
            actor,
            skill: 'stealth',
            target,
            targetSkill: 'perception',
            reason: '',
          }),
        code,
      );
    },
  );
});
