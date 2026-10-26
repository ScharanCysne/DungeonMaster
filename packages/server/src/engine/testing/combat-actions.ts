import type { ToolResult } from '@dungeon/shared';
import type { Engine, EventDraft } from '../index.js';
import { receipt, value } from './fixtures.js';

export const combatActions: {
  name: string;
  prepare: (engine: Engine) => () => ToolResult<unknown, EventDraft>;
}[] = [
  {
    name: 'attack',
    prepare: (engine) => () =>
      engine.attack({ attacker: 'char:player', target: 'char:peer' }),
  },
  {
    name: 'skill_check',
    prepare: (engine) => () =>
      engine.skill_check({
        actor: 'char:player',
        skill: 'athletics',
        dc: 25,
        advantage: 'none',
        reason: 'Combat action',
      }),
  },
  {
    name: 'contested_check',
    prepare: (engine) => () =>
      engine.contested_check({
        actor: 'char:player',
        skill: 'athletics',
        target: 'char:peer',
        targetSkill: 'acrobatics',
        reason: 'Combat action',
      }),
  },
  {
    name: 'search',
    prepare: (engine) => {
      const checkId = receipt(engine, 'perception');
      return () =>
        engine.search({ actor: 'char:player', area: 'loc:room', checkId });
    },
  },
  {
    name: 'open_container',
    prepare: (engine) => () =>
      engine.open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
  },
  {
    name: 'unlock_container',
    prepare: (engine) => () =>
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'key',
        itemId: 'item:key',
      }),
  },
  {
    name: 'transfer_item',
    prepare: (engine) => () =>
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:floor',
        to: 'char:player',
        reason: 'pick_up',
      }),
  },
  {
    name: 'equip',
    prepare: (engine) => () =>
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
  },
  {
    name: 'unequip',
    prepare: (engine) => {
      value(
        engine.equip({
          actor: 'char:player',
          item: 'item:rock',
          slot: 'main_hand',
        }),
      );
      return () =>
        engine.unequip({
          actor: 'char:player',
          item: 'item:rock',
          slot: 'main_hand',
        });
    },
  },
  {
    name: 'hide',
    prepare: (engine) => {
      const checkId = receipt(engine);
      return () => engine.hide({ actor: 'char:player', checkId });
    },
  },
  {
    name: 'heal with receipt',
    prepare: (engine) => {
      const checkId = receipt(engine, 'medicine');
      return () =>
        engine.heal({ target: 'char:peer', dice: '1d4', source: { checkId } });
    },
  },
];
