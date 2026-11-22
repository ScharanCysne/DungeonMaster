import { describe, it } from 'vitest';
import type { CharacterId, ToolResult } from '@dungeon/shared';
import type { Engine, EventDraft } from './index.js';
import { entry, fixture, rejects } from './testing/fixtures.js';

const commands: {
  name: string;
  run: (engine: Engine, actor: CharacterId) => ToolResult<unknown, EventDraft>;
}[] = [
  {
    name: 'search',
    run: (e, actor) =>
      e.search({ actor, area: 'loc:room', checkId: 'missing' }),
  },
  {
    name: 'open_container',
    run: (e, actor) => e.open_container({ actor, container: 'container:box' }),
  },
  {
    name: 'unlock_container',
    run: (e, actor) =>
      e.unlock_container({
        actor,
        container: 'container:lockbox',
        method: 'key',
        itemId: 'item:key',
      }),
  },
  {
    name: 'transfer_item',
    run: (e, actor) =>
      e.transfer_item({
        actor,
        item: 'item:floor',
        to: actor,
        reason: 'pick_up',
      }),
  },
  {
    name: 'equip',
    run: (e, actor) => e.equip({ actor, item: 'item:rock', slot: 'main_hand' }),
  },
  {
    name: 'unequip',
    run: (e, actor) =>
      e.unequip({ actor, item: 'item:rock', slot: 'main_hand' }),
  },
  { name: 'hide', run: (e, actor) => e.hide({ actor, checkId: 'missing' }) },
];

describe('actor guards', () => {
  for (const command of commands) {
    it(`${command.name} rejects an unknown actor without changes`, () => {
      const engine = fixture();
      rejects(
        engine,
        () => command.run(engine, 'char:missing'),
        'NO_SUCH_ENTITY',
        'char:missing',
      );
    });
    it(`${command.name} rejects an unconscious actor without changes`, () => {
      const engine = fixture((seed) => {
        entry(seed.characters, 'char:player').conscious = false;
      });
      rejects(
        engine,
        () => command.run(engine, 'char:player'),
        'ACTOR_UNCONSCIOUS',
        'char:player',
      );
    });
  }
});
