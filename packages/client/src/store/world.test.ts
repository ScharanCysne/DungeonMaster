import { expect, it } from 'vitest';
import { event, freeze, result, snapshot } from '../testing/fixtures';
import { applyServerMessage } from './reducer';
import { createInitialState } from './types';

it('projects witnessed movement, damage, healing, transfers and gold immutably', () => {
  const state = applyServerMessage(createInitialState(), snapshot);
  const next = applyServerMessage(
    freeze(state),
    result([
      event('EntityMoved', {
        entityId: 'char:player',
        from: 'loc:room',
        to: 'loc:room',
        tile: { x: 2, y: 1 },
        path: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      }),
      event('DamageApplied', undefined, { seq: 1 }),
      event(
        'Healed',
        {
          target: 'char:ilsa',
          amount: 2,
          hp: 10,
          conscious: true,
          roll: { expr: '2', rolls: [], total: 2, outcome: 'success' },
          source: 'rest',
        },
        { seq: 2 },
      ),
      event(
        'ItemTransferred',
        {
          itemId: 'item:quill',
          from: { kind: 'container', id: 'container:box' },
          to: { kind: 'character', id: 'char:player' },
          reason: 'buy',
          goldChanges: [{ characterId: 'char:player', gold: 10 }],
        },
        { seq: 3 },
      ),
    ]),
  );
  expect(next.world.positions['char:player']?.tile).toEqual({ x: 2, y: 1 });
  expect(next.world.entities['char:brann']).toMatchObject({ hp: 9 });
  expect(next.world.entities['char:ilsa']).toMatchObject({ hp: 10 });
  expect(next.world.inventory).toEqual(['item:rope', 'item:quill']);
  expect(next.world.gold).toBe(10);
  expect(next.world.entities['char:player']).toMatchObject({ gold: 10 });
  expect(state.world.inventory).toEqual(['item:rope']);
});
it('projects created nodes, reveal, containers and quests without using seed or debug events', () => {
  const state = applyServerMessage(createInitialState(), snapshot);
  const next = applyServerMessage(
    state,
    result([
      event('EntityCreated', undefined, { seq: 1 }),
      event('EntityRevealed', undefined, { seq: 2 }),
      event('ContainerUnlocked', undefined, { seq: 3 }),
      event('ContainerOpened', undefined, { seq: 4 }),
      event('FactCreated', undefined, { seq: 5 }),
      event('SeedLoaded', undefined, { seq: 6 }),
    ]),
  );
  expect(next.world.entities['container:box']).toMatchObject({
    hidden: false,
    locked: false,
    opened: true,
  });
  expect(next.world.entities['fact:quill']).toMatchObject({ truth: 'unknown' });
  expect(next.world.gold).toBe(20);
});
it('removes hidden entities from world, inventory, positions, and selection', () => {
  const state = applyServerMessage(createInitialState(), snapshot);
  state.selection.ids = ['item:rope'];
  const next = applyServerMessage(
    freeze(state),
    result([event('EntityHidden', { entityId: 'item:rope' })]),
  );
  expect(next.world.entities['item:rope']).toBeUndefined();
  expect(next.world.inventory).toEqual([]);
  expect(next.selection.ids).toEqual([]);
});
it('does not show another character inventory as the player satchel', () => {
  const state = applyServerMessage(createInitialState(), snapshot);
  const next = applyServerMessage(
    state,
    result([
      event('ItemTransferred', {
        itemId: 'item:rope',
        from: { kind: 'character', id: 'char:player' },
        to: { kind: 'character', id: 'char:ilsa' },
        reason: 'give',
        goldChanges: [],
      }),
    ]),
  );
  expect(next.world.inventory).toEqual([]);
});
