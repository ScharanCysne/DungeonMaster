import type { ApplyDamageOutput, CharacterId, Roll } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import type { EngineCharacter } from '../state.js';

export function damage(
  ctx: CommandContext,
  target: EngineCharacter,
  roll: Roll,
  cause: string,
  actor: CharacterId | null,
  minimum = 0,
): CommandValue<ApplyDamageOutput> {
  const amount = Math.max(minimum, roll.total);
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) target.conscious = false;
  const value = {
    target: target.id,
    amount,
    hp: target.hp,
    conscious: target.conscious,
    roll,
    cause,
  };
  ctx.emit(
    { type: 'DamageApplied', payload: value },
    actor,
    target.locationId,
    [target.id],
  );
  return {
    value,
    facts: [
      `${target.name} took ${amount} damage from ${cause}; HP is ${target.hp}/${target.maxHp}${target.conscious ? '' : ', unconscious'}.`,
    ],
  };
}
