import type { OpenContainerInput, OpenContainerOutput } from '@dungeon/shared';
import { accessibleContainer, revealContents } from '../containers.js';
import { requireRule } from '../errors.js';
import type { CommandContext, CommandValue } from '../events.js';
import { consciousCharacter } from '../spatial.js';

export function openContainer(
  ctx: CommandContext,
  input: OpenContainerInput,
): CommandValue<OpenContainerOutput> {
  const actor = consciousCharacter(ctx.state, input.actor);
  const container = accessibleContainer(ctx.state, actor, input.container);
  requireRule(
    !container.locked,
    'CONTAINER_LOCKED',
    `${container.id}: expected an unlocked container.`,
  );
  container.opened = true;
  const value = {
    containerId: container.id,
    revealed: revealContents(ctx.state, container),
  };
  ctx.emit(
    { type: 'ContainerOpened', payload: value },
    actor.id,
    container.locationId,
  );
  return {
    value,
    facts: [
      `${actor.name} opened ${container.name}; revealed ${value.revealed.join(', ') || 'no new items'}.`,
    ],
  };
}
