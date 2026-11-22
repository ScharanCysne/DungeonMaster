import type { PassTurnInput, PassTurnOutput } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import {
  activeCombat,
  advanceTurn,
  requireTurn,
  turnPosition,
} from '../rules/combat.js';

export function passTurn(
  ctx: CommandContext,
  input: PassTurnInput,
): CommandValue<PassTurnOutput> {
  const combat = activeCombat(ctx.state);
  requireTurn(ctx.state, input.actor);
  advanceTurn(ctx);
  return {
    value: turnPosition(combat),
    facts: [`${input.actor} passed their turn.`],
  };
}
