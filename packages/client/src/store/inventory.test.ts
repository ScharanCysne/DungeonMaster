import { expect, it } from 'vitest';
import { event, freeze, result, snapshot } from '../testing/fixtures';
import { applyServerMessage } from './reducer';
import { applyClientAction } from './actions';
import { createInitialState } from './types';

const seeded = () => applyServerMessage(createInitialState(), snapshot);
const pickup = () =>
  event('ItemTransferred', {
    itemId: 'item:quill',
    from: { kind: 'container', id: 'container:box' },
    to: { kind: 'character', id: 'char:player' },
    reason: 'pick_up',
    goldChanges: [],
  });
const equip = () =>
  event('ItemEquipped', {
    characterId: 'char:player',
    itemId: 'item:quill',
    slot: 'main_hand',
  });
it('marks actual acquisition, not entity creation, and expires new badges on the next commit', () => {
  const state = seeded();
  const next = applyServerMessage(freeze(state), result([pickup()]));
  expect(next.world.acquiredAt).toEqual({ 'item:quill': 1 });
  expect(state.world.acquiredAt).toEqual({});
  const later = applyServerMessage(next, result([], 2));
  expect(later.world.acquiredAt['item:quill']).not.toBe(later.world.beat);
});
it('keeps acquisition and equipment through post-commit snapshots', () => {
  const state = applyServerMessage(seeded(), result([pickup(), equip()]));
  const next = applyServerMessage(state, {
    ...snapshot,
    beat: 1,
    inventory: ['item:rope', 'item:quill'],
  });
  expect(next.world.acquiredAt).toEqual({ 'item:quill': 1 });
  expect(next.world.equipped).toEqual(['item:quill']);
});
it('replays metadata after a newer snapshot without rewinding inventory or gold', () => {
  const state = applyServerMessage(createInitialState(), {
    ...snapshot,
    beat: 3,
    gold: 99,
  });
  const next = applyServerMessage(freeze(state), result([pickup(), equip()]));
  expect(next.world.inventory).toEqual(['item:rope']);
  expect(next.world.gold).toBe(99);
  expect(next.world.beat).toBe(3);
  expect(next.world.acquiredAt['item:quill']).toBe(1);
  expect(next.world.equipped).toEqual(['item:quill']);
});
it('ignores invisible acquisitions and another character equipment', () => {
  const state = applyServerMessage(
    seeded(),
    result([
      { ...pickup(), witnesses: ['char:ilsa'] },
      event('ItemEquipped', {
        characterId: 'char:ilsa',
        itemId: 'item:rope',
        slot: 'main_hand',
      }),
    ]),
  );
  expect(state.world.equipped).toEqual([]);
  expect(state.world.acquiredAt).toEqual({});
});
it.each(['unequip', 'give', 'hide'])('removes equipment after %s', (kind) => {
  const state = applyServerMessage(seeded(), result([pickup(), equip()]));
  const change =
    kind === 'unequip'
      ? event('ItemUnequipped', {
          characterId: 'char:player',
          itemId: 'item:quill',
          slot: 'main_hand',
        })
      : kind === 'hide'
        ? event('EntityHidden', { entityId: 'item:quill' })
        : event('ItemTransferred', {
            itemId: 'item:quill',
            from: { kind: 'character', id: 'char:player' },
            to: { kind: 'character', id: 'char:ilsa' },
            reason: 'give',
            goldChanges: [],
          });
  expect(
    applyServerMessage(freeze(state), result([change], 2)).world.equipped,
  ).toEqual([]);
});
it('reveal completion only updates the active beat and rejects stale timer callbacks', () => {
  const state = applyServerMessage(seeded(), result());
  expect(
    applyClientAction(freeze(state), { type: 'journal_revealed', beat: 0 }),
  ).toBe(state);
  expect(
    applyClientAction(state, { type: 'journal_revealed', beat: 1 }).journal
      .reveal?.status,
  ).toBe('complete');
});
