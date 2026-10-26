import type {
  Holder,
  HolderId,
  TransferItemInput,
  TransferItemOutput,
} from '@dungeon/shared';
import { accessibleContainer, openAccess } from '../containers.js';
import { removeFromHolder } from '../equipment.js';
import { EngineError, requireRule, requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { spendReceipt } from '../receipts.js';
import { consciousCharacter, sameRoom } from '../spatial.js';
import type { EngineCharacter, EngineState } from '../state.js';

function destination(
  state: EngineState,
  actor: EngineCharacter,
  id: HolderId,
): Holder {
  for (const character of state.characters.values())
    if (character.id === id) {
      sameRoom(state, actor, character.locationId);
      return { kind: 'character', id: character.id };
    }
  for (const container of state.containers.values())
    if (container.id === id) {
      openAccess(accessibleContainer(state, actor, container.id));
      return { kind: 'container', id: container.id };
    }
  for (const location of state.locations.values())
    if (location.id === id) {
      sameRoom(state, actor, location.id);
      return { kind: 'location', id: location.id };
    }
  throw new EngineError(
    'NO_SUCH_ENTITY',
    `${id}: expected an existing character, container or location.`,
  );
}

export function transferItem(
  ctx: CommandContext,
  input: TransferItemInput,
): CommandValue<TransferItemOutput> {
  const { state } = ctx;
  const actor = consciousCharacter(state, input.actor);
  const item = requireValue(state.items.get(input.item), input.item);
  const from = item.holder;
  const to = destination(state, actor, input.to);
  const owned = from.kind === 'character' && from.id === actor.id;
  requireRule(
    !item.hidden || owned,
    'ITEM_NOT_REACHABLE',
    `${item.id}: expected a revealed item or one carried by ${actor.id}.`,
  );
  requireRule(
    from.id !== to.id,
    'INVALID_TRANSFER',
    `${item.id}: destination ${to.id} must differ from its holder ${from.id}.`,
  );
  let holder: EngineCharacter | undefined;
  if (from.kind === 'character') {
    holder = requireValue(state.characters.get(from.id), from.id);
    sameRoom(state, actor, holder.locationId);
  } else if (from.kind === 'container') {
    openAccess(accessibleContainer(state, actor, from.id));
  } else {
    sameRoom(state, actor, from.id);
  }
  const takesFromOther = ['steal', 'buy', 'loot'].includes(input.reason);
  if (takesFromOther) {
    requireRule(
      holder !== undefined && !owned && to.id === actor.id,
      'INVALID_TRANSFER',
      `${input.reason} ${item.id}: expected another character's item transferred to ${actor.id}.`,
    );
  } else if (input.reason === 'pick_up') {
    requireRule(
      from.kind !== 'character' && to.id === actor.id,
      'ITEM_NOT_REACHABLE',
      `${item.id}: pick_up expects a floor/container item transferred to ${actor.id}.`,
    );
  } else {
    requireRule(
      owned &&
        (input.reason === 'give'
          ? to.kind === 'character'
          : to.kind !== 'character'),
      'INVALID_TRANSFER',
      `${input.reason} ${item.id}: expected an item carried by ${actor.id} and a ${input.reason === 'give' ? 'character' : 'container or location'} destination.`,
    );
  }
  const goldChanges: TransferItemOutput['goldChanges'] = [];
  if (input.reason === 'steal')
    spendReceipt(state, input.checkId, actor.id, ['sleight_of_hand']);
  if (input.reason === 'loot') {
    requireRule(
      holder !== undefined && !holder.conscious,
      'HOLDER_CONSCIOUS',
      `${from.id}: loot expects an unconscious holder.`,
    );
  }
  if (input.reason === 'buy') {
    const seller = requireValue(holder, from.id);
    requireRule(
      seller.conscious && !seller.tags.includes('unwilling_to_sell'),
      'SELLER_UNWILLING',
      `${seller.id}: expected a conscious, willing seller without the unwilling_to_sell tag.`,
    );
    const price = requireValue(input.price, 'price');
    requireRule(
      price <= actor.gold,
      'INSUFFICIENT_GOLD',
      `${actor.id}: has ${actor.gold} gold; expected at least ${price}.`,
    );
    requireRule(
      Number.isSafeInteger(seller.gold + price),
      'INVALID_GOLD',
      `${seller.gold} + ${price}: expected a safe integer gold balance.`,
    );
    actor.gold -= price;
    seller.gold += price;
    goldChanges.push(
      { characterId: actor.id, gold: actor.gold },
      { characterId: seller.id, gold: seller.gold },
    );
  }
  removeFromHolder(ctx, item, actor.id);
  item.holder = to;
  if (to.kind === 'character')
    requireValue(state.characters.get(to.id), to.id).inventory.push(item.id);
  if (to.kind === 'container')
    requireValue(state.containers.get(to.id), to.id).contents.push(item.id);
  const value = {
    itemId: item.id,
    from,
    to,
    reason: input.reason,
    goldChanges,
  };
  const targets = [from, to].flatMap((endpoint) =>
    endpoint.kind === 'character' ? [endpoint.id] : [],
  );
  ctx.emit(
    { type: 'ItemTransferred', payload: value },
    actor.id,
    actor.locationId,
    targets,
  );
  return {
    value,
    facts: [
      `${actor.name} transferred ${item.name} from ${from.id} to ${to.id} (${input.reason})${input.reason === 'buy' ? ` for ${input.price} gold` : ''}.`,
    ],
  };
}
