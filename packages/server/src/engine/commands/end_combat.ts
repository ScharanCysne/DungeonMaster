import type { EndCombatInput, EndCombatOutput } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { activeCombat } from '../rules/combat.js';

export function endCombat(
  ctx: CommandContext,
  input: EndCombatInput,
): CommandValue<EndCombatOutput> {
  const combat = activeCombat(ctx.state);
  ctx.state.combat = null;
  ctx.emit({ type: 'CombatEnded', payload: input }, null, combat.roomId);
  return { value: input, facts: [`Combat ended: ${input.reason}.`] };
}
