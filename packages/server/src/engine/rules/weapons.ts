import type { AttackInput, Roll } from '@dungeon/shared';
import { carriedItem } from '../equipment.js';
import { requireRule, requireValue } from '../errors.js';
import { consciousCharacter, sameRoom } from '../spatial.js';
import type { EngineState } from '../state.js';
import { abilityModifier } from './checks.js';
import { parseDice, rollDice } from './dice.js';
import type { RandomState } from './dice.js';

export function prepareAttack(state: EngineState, input: AttackInput) {
  const attacker = consciousCharacter(state, input.attacker);
  const target = requireValue(state.characters.get(input.target), input.target);
  sameRoom(state, attacker, target.locationId);
  const weaponId = input.weaponId ?? attacker.equipped.main_hand;
  const item =
    weaponId === undefined
      ? undefined
      : requireValue(state.items.get(weaponId), weaponId);
  if (input.weaponId !== undefined) {
    carriedItem(state, attacker, input.weaponId);
    requireRule(
      item?.damage !== undefined,
      'INVALID_WEAPON',
      `${input.weaponId}: expected weapon damage dice.`,
    );
  }
  const weapon = item?.damage === undefined ? undefined : item;
  const ability = weapon?.tags.includes('ranged')
    ? attacker.abilities.dex
    : weapon?.tags.includes('finesse')
      ? Math.max(attacker.abilities.str, attacker.abilities.dex)
      : attacker.abilities.str;
  const modifier = abilityModifier(ability);
  if (weapon?.damage !== undefined) {
    const dice = parseDice(weapon.damage);
    // Preflight even critical damage so invalid attacks cannot commit initiative.
    requireRule(
      Number.isSafeInteger(
        Math.abs(dice.modifier + modifier) + 2 * dice.count * dice.sides,
      ),
      'INVALID_DICE',
      `${weapon.damage}: damage with ability modifier ${modifier} exceeds safe integer arithmetic.`,
    );
  }
  return { attacker, target, weapon, modifier };
}

export function attackDamage(
  state: RandomState,
  dice: string | undefined,
  modifier: number,
  critical: boolean,
): Roll {
  if (dice === undefined)
    return {
      expr: `1${modifier >= 0 ? '+' : ''}${modifier}`,
      rolls: [],
      total: 1 + modifier,
      outcome: 'success',
    };
  const parsed = parseDice(dice);
  const first = rollDice(state, dice);
  const rolls = critical
    ? [...first.rolls, ...rollDice(state, dice).rolls]
    : first.rolls;
  const bonus = parsed.modifier + modifier;
  const total = rolls.reduce((sum, die) => sum + die, bonus);
  requireRule(
    Number.isSafeInteger(total) && Number.isSafeInteger(bonus),
    'INVALID_DICE',
    `${dice}: damage with ability modifier ${modifier} exceeds safe integer arithmetic.`,
  );
  return {
    expr: `${parsed.count * (critical ? 2 : 1)}d${parsed.sides}${bonus >= 0 ? '+' : ''}${bonus}`,
    rolls,
    total,
    outcome: 'success',
  };
}
