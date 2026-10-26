import type { AttackInput, AttackOutput } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { damage } from '../rules/damage.js';
import { rollDice } from '../rules/dice.js';
import { attackDamage, prepareAttack } from '../rules/weapons.js';

export function attack(
  ctx: CommandContext,
  input: AttackInput,
): CommandValue<AttackOutput> {
  const { attacker, target, weapon, modifier } = prepareAttack(
    ctx.state,
    input,
  );
  const bonus = modifier + 2;
  const roll = rollDice(ctx.state, `1d20${bonus >= 0 ? '+' : ''}${bonus}`);
  const critical = roll.rolls[0] === 20;
  const hit = critical || (roll.rolls[0] !== 1 && roll.total >= target.ac);
  roll.dc = target.ac;
  roll.outcome = hit ? 'success' : 'failure';
  const value = {
    attacker: attacker.id,
    target: target.id,
    ...(weapon ? { weaponId: weapon.id } : {}),
    roll,
    hit,
    critical,
  };
  ctx.emit(
    { type: 'AttackResolved', payload: value },
    attacker.id,
    attacker.locationId,
    [target.id],
  );
  const facts = [
    `${attacker.name} attacked ${target.name}: ${roll.total} against AC ${target.ac}, ${critical ? 'critical hit' : hit ? 'hit' : 'miss'}.`,
  ];
  if (hit) {
    const applied = damage(
      ctx,
      target,
      attackDamage(ctx.state, weapon?.damage, modifier, critical),
      `Attack by ${attacker.id}${weapon ? ` with ${weapon.id}` : ' (unarmed)'}`,
      attacker.id,
      1,
    );
    facts.push(...applied.facts);
  }
  return { value, facts };
}
