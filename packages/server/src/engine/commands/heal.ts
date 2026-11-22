import type { HealInput, HealOutput } from '@dungeon/shared';
import { removeFromHolder } from '../equipment.js';
import { requireRule, requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { receiptById, spendReceipt } from '../receipts.js';
import { consciousCharacter, sameRoom } from '../spatial.js';
import { rollDice } from '../rules/dice.js';

export function heal(
  ctx: CommandContext,
  input: HealInput,
): CommandValue<HealOutput> {
  const { state } = ctx;
  const target = requireValue(state.characters.get(input.target), input.target);
  let healer = target;
  if (typeof input.source === 'object') {
    const receipt = receiptById(state, input.source.checkId);
    healer = consciousCharacter(state, receipt.actor);
    sameRoom(state, healer, target.locationId);
    spendReceipt(state, receipt.id, healer.id, ['medicine', 'religion']);
  } else if (input.source !== 'rest') {
    const item = requireValue(state.items.get(input.source), input.source);
    requireRule(
      item.kind === 'consumable',
      'INVALID_HEAL_SOURCE',
      `${item.id}: expected kind consumable, got ${item.kind}.`,
    );
    requireRule(
      item.holder.kind === 'character',
      'ITEM_NOT_REACHABLE',
      `${item.id}: expected a consumable carried by someone present.`,
    );
    if (item.holder.kind === 'character') {
      healer = requireValue(
        state.characters.get(item.holder.id),
        item.holder.id,
      );
      sameRoom(state, healer, target.locationId);
    }
    removeFromHolder(ctx, item, healer.id);
    state.items.delete(item.id);
  }
  const roll = rollDice(state, input.dice);
  const amount = Math.min(target.maxHp - target.hp, Math.max(0, roll.total));
  target.hp += amount;
  if (target.hp > 0) target.conscious = true;
  const value = {
    target: target.id,
    amount,
    hp: target.hp,
    conscious: target.conscious,
    roll,
    source: input.source,
  };
  ctx.emit({ type: 'Healed', payload: value }, healer.id, target.locationId, [
    target.id,
  ]);
  return {
    value,
    facts: [
      `${target.name} regained ${amount} HP; HP is ${target.hp}/${target.maxHp}${target.conscious ? ', conscious' : ', unconscious'}.`,
    ],
  };
}
