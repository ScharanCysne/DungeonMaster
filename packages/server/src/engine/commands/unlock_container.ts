import type {
  UnlockContainerInput,
  UnlockContainerOutput,
} from '@dungeon/shared';
import { accessibleContainer, revealContents } from '../containers.js';
import { requireRule, requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { spendReceipt } from '../receipts.js';
import { consciousCharacter } from '../spatial.js';

export function unlockContainer(
  ctx: CommandContext,
  input: UnlockContainerInput,
): CommandValue<UnlockContainerOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  const container = accessibleContainer(ctx.state, actor, input.container);
  requireRule(
    container.locked,
    'CONTAINER_NOT_LOCKED',
    `${container.id}: expected a locked container.`,
  );
  if (input.method === 'key') {
    const itemId = requireValue(input.itemId, 'itemId');
    const key = requireValue(ctx.state.items.get(itemId), itemId);
    requireRule(
      key.holder.kind === 'character' && key.holder.id === actor.id,
      'ITEM_NOT_REACHABLE',
      `${key.id}: expected a key carried by ${actor.id}.`,
    );
    requireRule(
      container.keyIds.includes(key.id),
      'WRONG_KEY',
      `${key.id}: expected a key bound to ${container.id} (${container.keyIds.join(', ') || 'none'}).`,
    );
  } else {
    requireRule(
      container.lockDc !== undefined,
      'LOCK_DC_REQUIRED',
      `${container.id}: expected lockDc for ${input.method}.`,
    );
    spendReceipt(
      ctx.state,
      input.checkId,
      actor.id,
      [input.method === 'force' ? 'athletics' : 'sleight_of_hand'],
      container.lockDc,
    );
  }
  container.locked = false;
  const value = {
    containerId: container.id,
    method: input.method,
    revealed: revealContents(ctx.state, container),
  };
  ctx.emit(
    { type: 'ContainerUnlocked', payload: value },
    actor.id,
    container.locationId,
  );
  return {
    value,
    facts: [
      `${actor.name} unlocked ${container.name} using ${input.method}; revealed ${value.revealed.join(', ') || 'no new items'}.`,
    ],
  };
}
