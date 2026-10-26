import type { CharacterId, PassTurnOutput } from '@dungeon/shared';
import { EngineError, requireRule, requireValue } from '../errors.js';
import type { CommandContext } from '../events.js';
import { consciousCharacter, roomOf } from '../spatial.js';
import type { CombatState, EngineState } from '../state.js';

export function activeCombat(state: EngineState): CombatState {
  if (!state.combat)
    throw new EngineError('NO_ACTIVE_COMBAT', 'Expected active combat.');
  return state.combat;
}

function eligible(state: EngineState, combat: CombatState, id: CharacterId) {
  const character = requireValue(state.characters.get(id), id);
  return (
    character.conscious && roomOf(state, character.locationId) === combat.roomId
  );
}

export function requireTurn(
  state: EngineState,
  actor: CharacterId,
  movement = false,
): void {
  const combat = state.combat;
  if (!combat) return;
  requireRule(
    combat.order[combat.turn] === actor,
    'NOT_YOUR_TURN',
    `${actor}: expected ${combat.order[combat.turn]}'s turn (round ${combat.round}).`,
  );
  consciousCharacter(state, actor);
  requireRule(
    eligible(state, combat, actor),
    'NOT_YOUR_TURN',
    `${actor}: expected a combatant still in ${combat.roomId}.`,
  );
  requireRule(
    !movement || !combat.moved,
    'MOVE_ALREADY_USED',
    `${actor}: movement already used this turn.`,
  );
}

export function turnPosition(combat: CombatState): PassTurnOutput {
  return {
    combatant: requireValue(combat.order[combat.turn], 'combat turn'),
    round: combat.round,
    turn: combat.turn,
  };
}

export function advanceTurn(ctx: CommandContext): void {
  const combat = activeCombat(ctx.state);
  for (let offset = 1; offset <= combat.order.length; offset++) {
    const position = combat.turn + offset;
    const turn = position % combat.order.length;
    const combatant = requireValue(combat.order[turn], 'combat turn');
    if (!eligible(ctx.state, combat, combatant)) continue;
    combat.round += Math.floor(position / combat.order.length);
    combat.turn = turn;
    combat.moved = false;
    ctx.emit(
      { type: 'TurnAdvanced', payload: turnPosition(combat) },
      null,
      combat.roomId,
      [combatant],
    );
    return;
  }
  // With nobody eligible, retain the cursor until healing or explicit ending.
}

export function finishTurn(
  ctx: CommandContext,
  actor: CharacterId | undefined,
  movement: boolean,
): void {
  const combat = ctx.state.combat;
  if (!combat) return;
  if (actor !== undefined) {
    if (movement) combat.moved = true;
    else {
      advanceTurn(ctx);
      return;
    }
  }
  // Fleeing or environmental damage can invalidate the current turn.
  if (!eligible(ctx.state, combat, turnPosition(combat).combatant))
    advanceTurn(ctx);
}
