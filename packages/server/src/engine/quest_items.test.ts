import { describe, expect, it } from 'vitest';
import type { Holder, ToolResult } from '@dungeon/shared';
import type { Engine, EventDraft } from './index.js';
import { entry, fixture, receipt, rejects, value } from './testing/fixtures.js';

describe('quest item protection and end condition', () => {
  const holders: { name: string; holder: Holder; expected: string | null }[] = [
    {
      name: 'player',
      holder: { kind: 'character', id: 'char:player' },
      expected: 'char:player',
    },
    {
      name: 'peer',
      holder: { kind: 'character', id: 'char:peer' },
      expected: 'char:peer',
    },
    {
      name: 'NPC',
      holder: { kind: 'character', id: 'char:seller' },
      expected: null,
    },
    {
      name: 'hidden container',
      holder: { kind: 'container', id: 'container:secret' },
      expected: null,
    },
    {
      name: 'floor',
      holder: { kind: 'location', id: 'loc:room' },
      expected: null,
    },
  ];
  for (const test of holders)
    it(`returns ${test.expected ?? 'null'} when the quest item is held by ${test.name}`, () => {
      const engine = fixture((seed) => {
        entry(seed.items, 'item:quest').holder = test.holder;
      });
      expect(engine.endCondition()).toBe(test.expected);
    });
  it('reaches the end condition through an actor-driven quest item transfer', () => {
    const engine = fixture();
    value(
      engine.open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:quest',
        to: 'char:player',
        reason: 'pick_up',
      }),
    );
    expect(engine.endCondition()).toBe('char:player');
  });
  it('protects a quest-critical consumable from destruction by healing with no state or RNG changes', () => {
    const engine = fixture((seed) => {
      const item = entry(seed.items, 'item:quest');
      item.kind = 'consumable';
      item.holder = { kind: 'character', id: 'char:player' };
    });
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:quest',
        slot: 'off_hand',
      }),
    );
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: '1d4',
          source: 'item:quest',
        }),
      'QUEST_ITEM_PROTECTED',
      'item:quest',
    );
  });
  const nonTransfers: {
    name: string;
    run: (engine: Engine) => ToolResult<unknown, EventDraft>;
  }[] = [
    {
      name: 'move',
      run: (e) => e.move({ actor: 'char:player', to: 'container:box' }),
    },
    {
      name: 'skill_check',
      run: (e) =>
        e.skill_check({
          actor: 'char:player',
          skill: 'stealth',
          dc: 5,
          advantage: 'none',
          reason: '',
        }),
    },
    {
      name: 'contested_check',
      run: (e) =>
        e.contested_check({
          actor: 'char:player',
          skill: 'stealth',
          target: 'char:seller',
          targetSkill: 'perception',
          reason: '',
        }),
    },
    {
      name: 'search',
      run: (e) =>
        e.search({
          actor: 'char:player',
          area: 'loc:room',
          checkId: receipt(e, 'perception'),
        }),
    },
    {
      name: 'open_container',
      run: (e) =>
        e.open_container({ actor: 'char:player', container: 'container:box' }),
    },
    {
      name: 'unlock_container',
      run: (e) =>
        e.unlock_container({
          actor: 'char:player',
          container: 'container:lockbox',
          method: 'key',
          itemId: 'item:key',
        }),
    },
    {
      name: 'equip',
      run: (e) =>
        e.equip({
          actor: 'char:player',
          item: 'item:quest',
          slot: 'main_hand',
        }),
    },
    {
      name: 'unequip',
      run: (e) => {
        value(
          e.equip({
            actor: 'char:player',
            item: 'item:quest',
            slot: 'main_hand',
          }),
        );
        return e.unequip({
          actor: 'char:player',
          item: 'item:quest',
          slot: 'main_hand',
        });
      },
    },
    {
      name: 'hide',
      run: (e) => e.hide({ actor: 'char:player', checkId: receipt(e) }),
    },
    {
      name: 'apply_damage',
      run: (e) =>
        e.apply_damage({ target: 'char:player', dice: '1d4', cause: 'fire' }),
    },
    {
      name: 'heal',
      run: (e) =>
        e.heal({ target: 'char:player', dice: '1d4', source: 'rest' }),
    },
  ];
  for (const command of nonTransfers)
    it(`${command.name} preserves a quest item’s canonical holder`, () => {
      const engine = fixture((seed) => {
        entry(seed.items, 'item:quest').holder = {
          kind: 'character',
          id: 'char:player',
        };
      });
      value(command.run(engine));
      expect(engine.state.items.get('item:quest')?.holder).toEqual({
        kind: 'character',
        id: 'char:player',
      });
    });
});
