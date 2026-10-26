import type {
  ContestedCheckInput,
  ContestedCheckOutput,
} from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { requireRule } from '../errors.js';
import { issueReceipt } from '../receipts.js';
import { consciousCharacter, sameRoom } from '../spatial.js';
import { checkRoll, skillAbilities } from '../rules/checks.js';

export function contestedCheck(
  ctx: CommandContext,
  input: ContestedCheckInput,
): CommandValue<ContestedCheckOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  const target = consciousCharacter(ctx.state, input.target);
  requireRule(
    actor.id !== target.id,
    'INVALID_TARGET',
    `${input.target}: expected a character other than ${actor.id}.`,
  );
  sameRoom(ctx.state, actor, target.locationId);
  const actorRoll = checkRoll(
    ctx.state,
    actor,
    skillAbilities[input.skill],
    input.skill,
    'none',
  );
  const targetRoll = checkRoll(
    ctx.state,
    target,
    skillAbilities[input.targetSkill],
    input.targetSkill,
    'none',
  );
  const winner =
    actorRoll.total === targetRoll.total
      ? null
      : actorRoll.total > targetRoll.total
        ? actor.id
        : target.id;
  actorRoll.dc = targetRoll.total;
  targetRoll.dc = actorRoll.total;
  actorRoll.outcome =
    winner === null ? 'tie' : winner === actor.id ? 'success' : 'failure';
  targetRoll.outcome =
    winner === null ? 'tie' : winner === target.id ? 'success' : 'failure';
  const receipt = issueReceipt(ctx.state, {
    actor: actor.id,
    skill: input.skill,
    total: actorRoll.total,
    outcome: actorRoll.outcome,
    target: target.id,
    targetSkill: input.targetSkill,
    winner,
  });
  const value = { checkId: receipt.id, winner, actorRoll, targetRoll };
  ctx.emit(
    { type: 'CheckRolled', payload: { kind: 'contested', ...input, ...value } },
    actor.id,
    actor.locationId,
    [target.id],
  );
  return {
    value,
    facts: [
      `${actor.name} rolled ${actorRoll.total} for ${input.skill}; ${target.name} rolled ${targetRoll.total} for ${input.targetSkill}. ${winner === null ? 'The contest tied.' : `${winner} won.`}`,
    ],
  };
}
