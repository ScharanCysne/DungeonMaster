import { describe, it } from 'vitest';
import type { EpisodeSeed, TransferItemInput } from '@dungeon/shared';
import { entry, fixture, receipt, rejects } from './testing/fixtures.js';

const pickUp: TransferItemInput = {
  actor: 'char:player',
  item: 'item:floor',
  to: 'char:player',
  reason: 'pick_up',
};
const drop: TransferItemInput = {
  actor: 'char:player',
  item: 'item:rock',
  to: 'container:box',
  reason: 'drop',
};
const buy: TransferItemInput = {
  actor: 'char:player',
  item: 'item:goods',
  to: 'char:player',
  reason: 'buy',
  price: 7,
};

describe('transfer rejections', () => {
  const cases: {
    name: string;
    input: TransferItemInput;
    code: string;
    edit?: (seed: EpisodeSeed) => void;
  }[] = [
    {
      name: 'unknown item',
      input: { ...pickUp, item: 'item:missing' },
      code: 'NO_SUCH_ENTITY',
    },
    {
      name: 'unknown recipient',
      input: { ...pickUp, to: 'char:missing' },
      code: 'NO_SUCH_ENTITY',
    },
    {
      name: 'unknown destination container',
      input: { ...drop, to: 'container:missing' },
      code: 'NO_SUCH_ENTITY',
    },
    {
      name: 'unknown destination location',
      input: { ...drop, to: 'loc:missing' },
      code: 'NO_SUCH_ENTITY',
    },
    {
      name: 'hidden floor item',
      input: { ...pickUp, item: 'item:secret' },
      code: 'ITEM_NOT_REACHABLE',
    },
    {
      name: 'hidden carried item',
      input: buy,
      code: 'ITEM_NOT_REACHABLE',
      edit: (seed) => {
        entry(seed.items, 'item:goods').hidden = true;
      },
    },
    {
      name: 'same holder destination',
      input: { ...pickUp, item: 'item:rock' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'recipient in another room',
      input: { ...drop, to: 'char:other', reason: 'give' },
      code: 'NOT_IN_SAME_ROOM',
    },
    {
      name: 'floor destination in another room',
      input: { ...drop, to: 'loc:other' },
      code: 'NOT_IN_SAME_ROOM',
    },
    {
      name: 'container destination in another room',
      input: drop,
      code: 'NOT_IN_SAME_ROOM',
      edit: (seed) => {
        entry(seed.containers, 'container:box').location = 'loc:other';
      },
    },
    {
      name: 'hidden container destination',
      input: { ...drop, to: 'container:secret' },
      code: 'CONTAINER_HIDDEN',
    },
    {
      name: 'locked container destination',
      input: { ...drop, to: 'container:lockbox' },
      code: 'CONTAINER_LOCKED',
    },
    {
      name: 'closed container destination',
      input: drop,
      code: 'CONTAINER_CLOSED',
    },
    {
      name: 'floor source in another room',
      input: pickUp,
      code: 'NOT_IN_SAME_ROOM',
      edit: (seed) => {
        entry(seed.items, 'item:floor').holder = {
          kind: 'location',
          id: 'loc:other',
        };
      },
    },
    {
      name: 'character source in another room',
      input: buy,
      code: 'NOT_IN_SAME_ROOM',
      edit: (seed) => {
        entry(seed.characters, 'char:seller').location = 'loc:other';
      },
    },
    {
      name: 'container source in another room',
      input: pickUp,
      code: 'NOT_IN_SAME_ROOM',
      edit: (seed) => {
        entry(seed.items, 'item:floor').holder = {
          kind: 'container',
          id: 'container:box',
        };
        entry(seed.containers, 'container:box').location = 'loc:other';
      },
    },
    {
      name: 'closed container source',
      input: pickUp,
      code: 'CONTAINER_CLOSED',
      edit: (seed) => {
        entry(seed.items, 'item:floor').holder = {
          kind: 'container',
          id: 'container:box',
        };
      },
    },
    {
      name: 'locked container source',
      input: pickUp,
      code: 'CONTAINER_LOCKED',
      edit: (seed) => {
        entry(seed.items, 'item:floor').holder = {
          kind: 'container',
          id: 'container:lockbox',
        };
      },
    },
    {
      name: 'hidden container source',
      input: pickUp,
      code: 'CONTAINER_HIDDEN',
      edit: (seed) => {
        entry(seed.items, 'item:floor').holder = {
          kind: 'container',
          id: 'container:secret',
        };
      },
    },
    {
      name: 'pick_up from another character',
      input: { ...pickUp, item: 'item:goods' },
      code: 'ITEM_NOT_REACHABLE',
    },
    {
      name: 'pick_up to another character',
      input: { ...pickUp, to: 'char:peer' },
      code: 'ITEM_NOT_REACHABLE',
    },
    {
      name: 'give an item not carried by the actor',
      input: { ...pickUp, to: 'char:peer', reason: 'give' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'give to a floor location',
      input: { ...drop, to: 'loc:room', reason: 'give' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'drop to a character',
      input: { ...drop, to: 'char:peer' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'drop an item not carried by the actor',
      input: { ...drop, item: 'item:goods', to: 'loc:room' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'buy an item from the floor',
      input: { ...buy, item: 'item:floor' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'buy into another character inventory',
      input: { ...buy, to: 'char:peer' },
      code: 'INVALID_TRANSFER',
    },
    {
      name: 'loot a conscious holder',
      input: { ...buy, reason: 'loot' },
      code: 'HOLDER_CONSCIOUS',
    },
    {
      name: 'insufficient gold',
      input: { ...buy, price: 21 },
      code: 'INSUFFICIENT_GOLD',
    },
    {
      name: 'unwilling seller',
      input: buy,
      code: 'SELLER_UNWILLING',
      edit: (seed) => {
        entry(seed.characters, 'char:seller').tags = ['unwilling_to_sell'];
      },
    },
    {
      name: 'unconscious seller',
      input: buy,
      code: 'SELLER_UNWILLING',
      edit: (seed) => {
        entry(seed.characters, 'char:seller').conscious = false;
      },
    },
    {
      name: 'unsafe resulting gold balance',
      input: buy,
      code: 'INVALID_GOLD',
      edit: (seed) => {
        entry(seed.characters, 'char:seller').gold = Number.MAX_SAFE_INTEGER;
      },
    },
    {
      name: 'steal without a receipt',
      input: { ...buy, reason: 'steal' },
      code: 'RECEIPT_REQUIRED',
    },
  ];
  for (const test of cases)
    it(`rejects ${test.name} without changing state`, () => {
      const engine = fixture(test.edit);
      rejects(engine, () => engine.transfer_item(test.input), test.code);
    });
  it('preserves a valid theft receipt when the recipient is unreachable', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'sleight_of_hand');
    rejects(
      engine,
      () =>
        engine.transfer_item({
          ...buy,
          reason: 'steal',
          to: 'char:other',
          checkId,
        }),
      'NOT_IN_SAME_ROOM',
    );
  });
});
