import type { ApplyDamageInput, ApplyDamageOutput } from '@dungeon/shared';
import { requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { rollDice } from '../rules/dice.js';
import { damage } from '../rules/damage.js';

export function applyDamage(
  ctx: CommandContext,
  input: ApplyDamageInput,
): CommandValue<ApplyDamageOutput> {
  const target = requireValue(
    ctx.state.characters.get(input.target),
    input.target,
  );
  const roll = rollDice(ctx.state, input.dice);
  return damage(ctx, target, roll, input.cause, null);
}
