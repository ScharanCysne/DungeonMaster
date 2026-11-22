import { requireRule } from './errors.js';
import type { EngineState } from './state.js';

export function protectQuestItems(
  before: EngineState,
  after: EngineState,
  command: string,
): void {
  // Check the transaction boundary so new commands cannot accidentally bypass this rule.
  for (const id of new Set([...before.items.keys(), ...after.items.keys()])) {
    const oldItem = before.items.get(id);
    const newItem = after.items.get(id);
    if (!oldItem?.questCritical && !newItem?.questCritical) continue;
    const preserved =
      oldItem !== undefined &&
      newItem !== undefined &&
      oldItem.questCritical === newItem.questCritical;
    const sameHolder =
      oldItem?.holder.kind === newItem?.holder.kind &&
      oldItem?.holder.id === newItem?.holder.id;
    requireRule(
      preserved && (sameHolder || command === 'transfer_item'),
      'QUEST_ITEM_PROTECTED',
      `${id}: expected an existing quest item moved only by actor-driven transfer_item; ${command} cannot destroy, create or relocate it.`,
    );
  }
}
