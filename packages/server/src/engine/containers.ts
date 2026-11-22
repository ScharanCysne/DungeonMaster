import type { ContainerId, ItemId } from '@dungeon/shared';
import { requireRule, requireValue } from './errors.js';
import { sameRoom } from './spatial.js';
import type { EngineCharacter, EngineContainer, EngineState } from './state.js';

export function accessibleContainer(
  state: EngineState,
  actor: EngineCharacter,
  id: ContainerId,
): EngineContainer {
  const container = requireValue(state.containers.get(id), id);
  sameRoom(state, actor, container.locationId);
  requireRule(
    !container.hidden,
    'CONTAINER_HIDDEN',
    `${id}: expected a revealed container.`,
  );
  return container;
}

export function openAccess(container: EngineContainer): void {
  requireRule(
    !container.locked,
    'CONTAINER_LOCKED',
    `${container.id}: expected an unlocked container.`,
  );
  requireRule(
    container.opened,
    'CONTAINER_CLOSED',
    `${container.id}: expected an opened container.`,
  );
}

export function revealContents(
  state: EngineState,
  container: EngineContainer,
): ItemId[] {
  const revealed: ItemId[] = [];
  for (const id of container.contents) {
    const item = requireValue(state.items.get(id), id);
    if (item.hidden) revealed.push(id);
    item.hidden = false;
  }
  return revealed;
}
