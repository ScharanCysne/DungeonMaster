import { describe, expect, it } from 'vitest';
import { rollSchema } from '@dungeon/shared';
import { beatSeed, hashSeed, parseDice, rollDice } from './index.js';

describe('dice', () => {
  it('repeats the entire sequence for the same session, beat and attempt', () => {
    const sequence = () => {
      const state = { rngState: beatSeed('session', 2, 0) };
      return Array.from({ length: 40 }, () => rollDice(state, '3d20+2'));
    };
    expect(sequence()).toEqual(sequence());
  });
  it('changes the sequence on a different attempt', () => {
    const sequence = (attempt: number) => {
      const state = { rngState: beatSeed('session', 2, attempt) };
      return Array.from({ length: 20 }, () => rollDice(state, '1d20').total);
    };
    expect(sequence(0)).not.toEqual(sequence(1));
  });
  it('separates seed tuple components without delimiter collisions', () => {
    expect(beatSeed('a,1', 2, 3)).not.toEqual(beatSeed('a', 12, 3));
  });
  it('hashes strings to stable unsigned 32-bit FNV-1a values', () => {
    expect([hashSeed(''), hashSeed('hello')]).toEqual([2166136261, 1335831723]);
  });
  it.each([4, 6, 8, 10, 12, 20, 100])(
    'rolls valid shared shapes with every d%i face represented',
    (sides) => {
      const state = { rngState: hashSeed('distribution') };
      const rolls = Array.from({ length: 5000 }, () =>
        rollDice(state, `1d${sides}`),
      );
      const counts = Array.from(
        { length: sides },
        (_, index) => rolls.filter((roll) => roll.total === index + 1).length,
      );
      expect({
        valid: rolls.every((roll) => rollSchema.safeParse(roll).success),
        inRange: counts.every(
          (count) =>
            count > (5000 / sides) * 0.4 && count < (5000 / sides) * 1.6,
        ),
      }).toEqual({ valid: true, inRange: true });
    },
  );
  it.each(['1d4', '20d100', '2d6+3', '3d8-4', '1d20+0'])(
    'adds the modifier to all rolled dice for %s',
    (expr) => {
      const state = { rngState: hashSeed('arithmetic') };
      const roll = rollDice(state, expr);
      expect(roll.total).toBe(
        roll.rolls.reduce((sum, die) => sum + die, parseDice(expr).modifier),
      );
    },
  );
  it.each([
    '',
    'd20',
    '0d6',
    '21d6',
    '1d3',
    '1d0',
    '1d7',
    '1d20+1.5',
    '1d20-',
    ' 1d6',
    '1D6',
    '1d6x',
    '-1d6',
    '1.5d6',
    '1d6+9007199254740991',
    '1d6\n',
  ])('rejects expression %j by name without advancing RNG', (expr) => {
    const state = { rngState: 123 };
    let message = '';
    try {
      rollDice(state, expr);
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }
    expect({
      state,
      namesExpression: message.includes(`${expr}: expected`),
    }).toEqual({
      state: { rngState: 123 },
      namesExpression: true,
    });
  });
});
