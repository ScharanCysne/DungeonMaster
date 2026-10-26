import type { ApplyDamageInput, ApplyDamageOutput } from '@dungeon/shared';
import { requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { rollDice } from '../rules/dice.js';

export function applyDamage(
  ctx: CommandContext,
  input: ApplyDamageInput,
): CommandValue<ApplyDamageOutput> {
  const target = requireValue(
    ctx.state.characters.get(input.target),
    input.target,
  );
  const roll = rollDice(ctx.state, input.dice);
  const amount = Math.max(0, roll.total);
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) target.conscious = false;
  const value = {
    target: target.id,
    amount,
    hp: target.hp,
    conscious: target.conscious,
    roll,
    cause: input.cause,
  };
  ctx.emit({ type: 'DamageApplied', payload: value }, null, target.locationId, [
    target.id,
  ]);
  return {
    value,
    facts: [
      `${target.name} took ${amount} damage from ${input.cause}; HP is ${target.hp}/${target.maxHp}${target.conscious ? '' : ', unconscious'}.`,
    ],
  };
}
