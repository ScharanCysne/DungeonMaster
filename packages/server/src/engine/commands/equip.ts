import type { EquipInput, EquipOutput } from '@dungeon/shared';
import { carriedItem } from '../equipment.js';
import { requireRule } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { consciousCharacter } from '../spatial.js';

export function equip(
  ctx: CommandContext,
  input: EquipInput,
): CommandValue<EquipOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  const item = carriedItem(ctx.state, actor, input.item);
  requireRule(
    actor.equipped[input.slot] === undefined,
    'SLOT_OCCUPIED',
    `${input.slot}: contains ${actor.equipped[input.slot]}; expected an empty slot.`,
  );
  requireRule(
    !Object.values(actor.equipped).includes(item.id),
    'ITEM_ALREADY_EQUIPPED',
    `${item.id}: expected an unequipped item.`,
  );
  actor.equipped[input.slot] = item.id;
  const value = { characterId: actor.id, itemId: item.id, slot: input.slot };
  ctx.emit(
    { type: 'ItemEquipped', payload: value },
    actor.id,
    actor.locationId,
  );
  return {
    value,
    facts: [`${actor.name} equipped ${item.name} in ${input.slot}.`],
  };
}
