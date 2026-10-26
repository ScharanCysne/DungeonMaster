import type { EntityId, SearchInput, SearchOutput } from '@dungeon/shared';
import { requireValue } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { spendReceipt } from '../receipts.js';
import {
  consciousCharacter,
  entityPosition,
  inside,
  sameRoom,
  roomOf,
} from '../spatial.js';

export function search(
  ctx: CommandContext,
  input: SearchInput,
): CommandValue<SearchOutput> {
  const { state } = ctx;
  const actor = consciousCharacter(state, input.actor);
  const area = requireValue(state.locations.get(input.area), input.area);
  sameRoom(state, actor, area.id);
  const receipt = spendReceipt(state, input.checkId, actor.id, [
    'perception',
    'investigation',
  ]);
  const revealed: EntityId[] = [];
  const candidates = [
    ...state.containers.values(),
    ...[...state.items.values()].filter((item) => {
      if (item.holder.kind === 'character') return false;
      if (item.holder.kind === 'location') return true;
      const container = requireValue(
        state.containers.get(item.holder.id),
        item.holder.id,
      );
      return !container.hidden && !container.locked && container.opened;
    }),
  ];
  for (const entity of candidates) {
    const position = entityPosition(state, entity.id);
    if (
      entity.hidden &&
      entity.findDc !== undefined &&
      entity.findDc <= receipt.total &&
      roomOf(state, position.locationId) === roomOf(state, area.id) &&
      inside(position.tile, area.tileBounds)
    ) {
      entity.hidden = false;
      revealed.push(entity.id);
      ctx.emit(
        { type: 'EntityRevealed', payload: { entityId: entity.id } },
        actor.id,
        position.locationId,
      );
    }
  }
  return {
    value: { revealed },
    facts: [
      `${actor.name} searched ${area.name} and revealed ${revealed.join(', ') || 'nothing'}.`,
    ],
  };
}
