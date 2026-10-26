import type { AttackInput, EventPayload } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { checkRoll } from '../rules/checks.js';
import { prepareAttack } from '../rules/weapons.js';
import { roomOf } from '../spatial.js';

export function startCombat(
  ctx: CommandContext,
  input: AttackInput,
): CommandValue<EventPayload<'CombatStarted'>> {
  const { attacker, target } = prepareAttack(ctx.state, input);
  const roomId = roomOf(ctx.state, attacker.locationId);
  const participants = [...ctx.state.characters.values()]
    .filter(
      (character) =>
        character.conscious &&
        roomOf(ctx.state, character.locationId) === roomId,
    )
    .map((character) => ({
      character,
      roll: checkRoll(ctx.state, character, 'dex', undefined, 'none'),
    }))
    .sort(
      (a, b) =>
        b.roll.total - a.roll.total ||
        b.character.abilities.dex - a.character.abilities.dex ||
        (a.character.id < b.character.id
          ? -1
          : a.character.id > b.character.id
            ? 1
            : 0),
    );
  const value = {
    order: participants.map(({ character }) => character.id),
    turn: 0,
    round: 1,
    initiative: participants.map(({ character, roll }) => ({
      characterId: character.id,
      roll,
    })),
  };
  ctx.state.combat = {
    order: value.order,
    turn: value.turn,
    round: value.round,
    roomId,
    moved: false,
  };
  ctx.emit({ type: 'CombatStarted', payload: value }, attacker.id, roomId, [
    target.id,
  ]);
  return {
    value,
    facts: [
      `Combat started in ${roomId}; initiative order: ${value.order.join(', ')}. Round 1, turn 0.`,
    ],
  };
}
