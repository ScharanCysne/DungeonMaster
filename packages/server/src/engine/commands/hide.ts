import type { HideInput, HideOutput } from '@dungeon/shared';
import type { CommandContext, CommandValue } from '../events.js';
import { spendReceipt } from '../receipts.js';
import { consciousCharacter } from '../spatial.js';

export function hide(
  ctx: CommandContext,
  input: HideInput,
): CommandValue<HideOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  spendReceipt(ctx.state, input.checkId, actor.id, ['stealth']);
  actor.hidden = true;
  const value = { entityId: actor.id };
  ctx.emit(
    { type: 'EntityHidden', payload: value },
    actor.id,
    actor.locationId,
  );
  return { value, facts: [`${actor.name} is hidden.`] };
}
