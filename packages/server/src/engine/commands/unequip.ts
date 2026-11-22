import type { UnequipInput, UnequipOutput } from '@dungeon/shared';
import { carriedItem } from '../equipment.js';
import { requireRule } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { consciousCharacter } from '../spatial.js';

export function unequip(
  ctx: CommandContext,
  input: UnequipInput,
): CommandValue<UnequipOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  const item = carriedItem(ctx.state, actor, input.item);
  requireRule(
    actor.equipped[input.slot] === item.id,
    'ITEM_NOT_EQUIPPED',
    `${item.id}: expected this item in ${input.slot}, got ${actor.equipped[input.slot] ?? 'empty'}.`,
  );
  delete actor.equipped[input.slot];
  const value = { characterId: actor.id, itemId: item.id, slot: input.slot };
  ctx.emit(
    { type: 'ItemUnequipped', payload: value },
    actor.id,
    actor.locationId,
  );
  return {
    value,
    facts: [`${actor.name} unequipped ${item.name} from ${input.slot}.`],
  };
}
