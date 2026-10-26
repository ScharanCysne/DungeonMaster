import { describe, expect, it } from 'vitest';
import { entry, fixture, rejects, value } from './testing/fixtures.js';

describe('apply_damage', () => {
  it('applies rolled environmental damage and emits its shared roll', () => {
    const engine = fixture();
    const result = engine.apply_damage({
      target: 'char:player',
      dice: '1d4+2',
      cause: 'fall',
    });
    if (!result.ok) throw new Error(result.error.message);
    expect({
      hp: engine.state.characters.get('char:player')?.hp,
      result,
    }).toMatchObject({
      hp: 12 - result.value.roll.total,
      result: {
        events: [
          {
            type: 'DamageApplied',
            actor: null,
            payload: { cause: 'fall', amount: result.value.roll.total },
          },
        ],
        facts: [expect.stringContaining('damage from fall')],
      },
    });
  });
  it('clamps lethal damage at zero HP and makes the target unconscious', () => {
    const result = value(
      fixture().apply_damage({
        target: 'char:player',
        dice: '1d4+100',
        cause: 'fire',
      }),
    );
    expect({ hp: result.hp, conscious: result.conscious }).toEqual({
      hp: 0,
      conscious: false,
    });
  });
  it('does not turn a negative damage roll into healing', () => {
    expect(
      value(
        fixture().apply_damage({
          target: 'char:player',
          dice: '1d4-100',
          cause: 'cold',
        }),
      ),
    ).toMatchObject({ amount: 0, hp: 12 });
  });
  it('can damage an unconscious character without reducing HP below zero', () => {
    const engine = fixture((seed) => {
      const actor = entry(seed.characters, 'char:player');
      actor.hp = 0;
      actor.conscious = false;
    });
    expect(
      value(
        engine.apply_damage({
          target: 'char:player',
          dice: '1d4',
          cause: 'fire',
        }),
      ).hp,
    ).toBe(0);
  });
  it('rejects an unknown damage target without changes', () => {
    const engine = fixture();
    rejects(
      engine,
      () =>
        engine.apply_damage({
          target: 'char:missing',
          dice: '1d4',
          cause: 'fall',
        }),
      'NO_SUCH_ENTITY',
      'char:missing',
    );
  });
  it('rejects invalid damage dice without changing state or RNG', () => {
    const engine = fixture();
    rejects(
      engine,
      () =>
        engine.apply_damage({
          target: 'char:player',
          dice: '2d3',
          cause: 'fall',
        }),
      'INVALID_DICE',
      '2d3',
    );
  });
});
