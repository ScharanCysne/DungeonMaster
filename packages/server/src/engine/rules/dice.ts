import type { Roll } from '@dungeon/shared';
import { EngineError } from '../errors.js';

export interface RandomState {
  rngState: number;
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

export function beatSeed(
  sessionSeed: string,
  beat: number,
  attempt: number,
): number {
  return hashSeed(JSON.stringify([sessionSeed, beat, attempt]));
}

export function random(state: RandomState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let value = state.rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function parseDice(expr: string): {
  count: number;
  sides: number;
  modifier: number;
} {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr);
  const count = Number(match?.[1]);
  const sides = Number(match?.[2]);
  const modifier = Number(match?.[3] ?? 0);
  if (
    !match ||
    match[0] !== expr ||
    count < 1 ||
    count > 20 ||
    ![4, 6, 8, 10, 12, 20, 100].includes(sides) ||
    !Number.isSafeInteger(modifier) ||
    !Number.isSafeInteger(Math.abs(modifier) + count * sides)
  ) {
    throw new EngineError(
      'INVALID_DICE',
      `${expr}: expected NdM[+K|-K], 1 <= N <= 20 and M in 4, 6, 8, 10, 12, 20, 100.`,
    );
  }
  return { count, sides, modifier };
}

export function rollDice(state: RandomState, expr: string): Roll {
  const { count, sides, modifier } = parseDice(expr);
  const rolls = Array.from(
    { length: count },
    () => Math.floor(random(state) * sides) + 1,
  );
  return {
    expr,
    rolls,
    total: rolls.reduce((sum, die) => sum + die, modifier),
    outcome: 'success',
  };
}
