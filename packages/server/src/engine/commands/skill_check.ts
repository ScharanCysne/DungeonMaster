import type { SkillCheckInput, SkillCheckOutput } from '@dungeon/shared';
import { requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { issueReceipt } from '../receipts.js';
import { consciousCharacter } from '../spatial.js';
import { checkRoll, skillAbilities } from '../rules/checks.js';

export function skillCheck(
  ctx: CommandContext,
  input: SkillCheckInput,
): CommandValue<SkillCheckOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  const ability =
    input.skill === undefined
      ? requireValue(input.ability, 'ability')
      : skillAbilities[input.skill];
  const roll = checkRoll(
    ctx.state,
    actor,
    ability,
    input.skill,
    input.advantage,
  );
  roll.dc = input.dc;
  roll.outcome = roll.total >= input.dc ? 'success' : 'failure';
  const selector =
    input.skill === undefined ? { ability } : { skill: input.skill };
  const receipt = issueReceipt(ctx.state, {
    actor: actor.id,
    ...selector,
    total: roll.total,
    outcome: roll.outcome,
  });
  ctx.emit(
    {
      type: 'CheckRolled',
      payload: {
        kind: 'skill',
        checkId: receipt.id,
        actor: actor.id,
        ...selector,
        dc: input.dc,
        advantage: input.advantage,
        reason: input.reason,
        roll,
      },
    },
    actor.id,
    actor.locationId,
  );
  return {
    value: {
      checkId: receipt.id,
      total: roll.total,
      outcome: roll.outcome,
      roll,
    },
    facts: [
      `${actor.name} rolled ${roll.total} for ${input.skill ?? ability} against DC ${input.dc}: ${roll.outcome}.`,
    ],
  };
}
