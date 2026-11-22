import type { CharacterId, ItemId } from '@dungeon/shared';
import { requireRule, requireValue } from './errors.js';
import type { CommandContext } from './events.js';
import type { EngineCharacter, EngineItem, EngineState } from './state.js';

export function carriedItem(
  state: EngineState,
  actor: EngineCharacter,
  id: ItemId,
): EngineItem {
  const item = requireValue(state.items.get(id), id);
  requireRule(
    item.holder.kind === 'character' && item.holder.id === actor.id,
    'ITEM_NOT_REACHABLE',
    `${id}: expected an item carried by ${actor.id}.`,
  );
  return item;
}

export function removeFromHolder(
  ctx: CommandContext,
  item: EngineItem,
  actor: CharacterId,
): void {
  if (item.holder.kind === 'container') {
    const holder = requireValue(
      ctx.state.containers.get(item.holder.id),
      item.holder.id,
    );
    holder.contents = holder.contents.filter((id) => id !== item.id);
  }
  if (item.holder.kind === 'character') {
    const holder = requireValue(
      ctx.state.characters.get(item.holder.id),
      item.holder.id,
    );
    holder.inventory = holder.inventory.filter((id) => id !== item.id);
    for (const slot of [
      'main_hand',
      'off_hand',
      'armor',
      'accessory',
    ] as const) {
      if (holder.equipped[slot] !== item.id) continue;
      delete holder.equipped[slot];
      ctx.emit(
        {
          type: 'ItemUnequipped',
          payload: { characterId: holder.id, itemId: item.id, slot },
        },
        actor,
        holder.locationId,
        [holder.id],
      );
    }
  }
}
