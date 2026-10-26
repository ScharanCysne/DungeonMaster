import type { Engine, EngineState } from '../../engine/index.js';
import { receipt, value } from '../../engine/testing/fixtures.js';
import { passTo, turnActor } from '../../engine/testing/combat.js';

export function hardState(state: EngineState) {
  const transient = new Set([
    'receipts',
    'receiptCounter',
    'rngState',
    'attempt',
  ]);
  return Object.fromEntries(
    Object.entries(state).filter(([field]) => !transient.has(field)),
  );
}
export const scriptedBeats: ((engine: Engine) => void)[] = [
  (engine) => {
    value(engine.move({ actor: 'char:player', to: 'container:box' }));
    value(
      engine.search({
        actor: 'char:player',
        area: 'loc:room',
        checkId: receipt(engine, 'perception'),
      }),
    );
    value(
      engine.contested_check({
        actor: 'char:player',
        skill: 'stealth',
        target: 'char:watcher',
        targetSkill: 'perception',
        reason: 'Slip past',
      }),
    );
    value(engine.hide({ actor: 'char:player', checkId: receipt(engine) }));
  },
  (engine) => {
    value(
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'key',
        itemId: 'item:key',
      }),
    );
    value(
      engine.open_container({
        actor: 'char:player',
        container: 'container:lockbox',
      }),
    );
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
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:floor',
        to: 'char:player',
        reason: 'pick_up',
      }),
    );
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    value(
      engine.unequip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:rock',
        to: 'char:peer',
        reason: 'give',
      }),
    );
  },
  (engine) => {
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'buy',
        price: 7,
      }),
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:seller',
        reason: 'give',
      }),
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'steal',
        checkId: receipt(engine, 'sleight_of_hand'),
      }),
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:floor',
        to: 'container:box',
        reason: 'drop',
      }),
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'loc:room',
        reason: 'drop',
      }),
    );
    value(
      engine.equip({
        actor: 'char:peer',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
  },
  (engine) => {
    value(
      engine.apply_damage({
        target: 'char:player',
        dice: '1d4+3',
        cause: 'Beam',
      }),
    );
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:potion',
        slot: 'accessory',
      }),
    );
    value(
      engine.heal({
        target: 'char:player',
        dice: '1d4',
        source: 'item:potion',
      }),
    );
    value(
      engine.heal({
        target: 'char:player',
        dice: '1d4',
        source: { checkId: receipt(engine, 'medicine') },
      }),
    );
    value(engine.heal({ target: 'char:player', dice: '1d4', source: 'rest' }));
  },
  (engine) => {
    const result = engine.attack({
      attacker: 'char:player',
      target: 'char:seller',
    });
    if (!result.ok && result.error.code !== 'NOT_YOUR_TURN') value(result);
    passTo(engine, 'char:player');
    value(engine.move({ actor: 'char:player', to: 'container:box' }));
  },
  (engine) => {
    value(engine.pass_turn({ actor: turnActor(engine) }));
    passTo(engine, 'char:peer');
    value(engine.attack({ attacker: 'char:peer', target: 'char:watcher' }));
    value(
      engine.apply_damage({
        target: 'char:watcher',
        dice: '1d4+99',
        cause: 'Falling beam',
      }),
    );
    value(engine.heal({ target: 'char:watcher', dice: '1d4', source: 'rest' }));
    value(engine.end_combat({ reason: 'talked_down' }));
    value(engine.move({ actor: 'char:player', to: 'loc:other' }));
  },
];
