import { describe, expect, it } from 'vitest';
import { entry, fixture, receipt, value } from './testing/fixtures.js';

describe('transfer_item', () => {
  it('picks up a revealed floor item into the actor inventory', () => {
    const engine = fixture();
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:floor',
        to: 'char:player',
        reason: 'pick_up',
      }),
    );
    expect(engine.state.characters.get('char:player')?.inventory).toContain(
      'item:floor',
    );
  });
  it('picks up contents from an opened container and removes them from its contents', () => {
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
    expect(engine.state.containers.get('container:box')?.contents).toEqual([]);
  });
  it('gives a carried item to a character in the same room', () => {
    const engine = fixture();
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:rock',
        to: 'char:peer',
        reason: 'give',
      }),
    );
    expect({
      old: engine.state.characters
        .get('char:player')
        ?.inventory.includes('item:rock'),
      new: engine.state.characters
        .get('char:peer')
        ?.inventory.includes('item:rock'),
      holder: engine.state.items.get('item:rock')?.holder,
    }).toEqual({
      old: false,
      new: true,
      holder: { kind: 'character', id: 'char:peer' },
    });
  });
  it('drops a carried item onto the room floor', () => {
    const engine = fixture();
    expect(
      value(
        engine.transfer_item({
          actor: 'char:player',
          item: 'item:rock',
          to: 'loc:room',
          reason: 'drop',
        }),
      ).to,
    ).toEqual({ kind: 'location', id: 'loc:room' });
  });
  it('deposits a carried item into an accessible open container', () => {
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
        item: 'item:rock',
        to: 'container:box',
        reason: 'drop',
      }),
    );
    expect(engine.state.containers.get('container:box')?.contents).toContain(
      'item:rock',
    );
  });
  it('steals from a present holder with a successful sleight_of_hand receipt', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'sleight_of_hand');
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'steal',
        checkId,
      }),
    );
    expect({
      holder: engine.state.items.get('item:goods')?.holder,
      spent: engine.state.receipts.get(checkId)?.spent,
    }).toEqual({
      holder: { kind: 'character', id: 'char:player' },
      spent: true,
    });
  });
  it('moves the purchase price from buyer to seller and records the resulting balances', () => {
    const engine = fixture();
    const output = value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'buy',
        price: 7,
      }),
    );
    expect({
      balances: output.goldChanges,
      buyer: engine.state.characters.get('char:player')?.gold,
      seller: engine.state.characters.get('char:seller')?.gold,
    }).toEqual({
      balances: [
        { characterId: 'char:player', gold: 13 },
        { characterId: 'char:seller', gold: 27 },
      ],
      buyer: 13,
      seller: 27,
    });
  });
  it('allows a purchase priced at the buyer’s entire balance', () => {
    const engine = fixture();
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'buy',
        price: 20,
      }),
    );
    expect(engine.state.characters.get('char:player')?.gold).toBe(0);
  });
  it('allows a zero-price purchase', () => {
    const engine = fixture();
    expect(
      value(
        engine.transfer_item({
          actor: 'char:player',
          item: 'item:goods',
          to: 'char:player',
          reason: 'buy',
          price: 0,
        }),
      ).goldChanges,
    ).toEqual([
      { characterId: 'char:player', gold: 20 },
      { characterId: 'char:seller', gold: 20 },
    ]);
  });
  it('loots an unconscious holder without starting combat', () => {
    const engine = fixture((seed) => {
      const seller = entry(seed.characters, 'char:seller');
      seller.hp = 0;
      seller.conscious = false;
    });
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'loot',
      }),
    );
    expect({
      holder: engine.state.items.get('item:goods')?.holder,
      combat: engine.state.combat,
    }).toEqual({
      holder: { kind: 'character', id: 'char:player' },
      combat: null,
    });
  });
  it('unequips a transferred item and emits the removal before ItemTransferred', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    const result = engine.transfer_item({
      actor: 'char:player',
      item: 'item:rock',
      to: 'char:peer',
      reason: 'give',
    });
    expect({
      result,
      slots: engine.state.characters.get('char:player')?.equipped,
    }).toMatchObject({
      result: {
        ok: true,
        events: [{ type: 'ItemUnequipped' }, { type: 'ItemTransferred' }],
        facts: [expect.stringContaining('Player transferred')],
      },
      slots: {},
    });
  });
  it('allows an actor to transfer a hidden item already carried by them', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:rock').hidden = true;
    });
    expect(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:rock',
        to: 'loc:room',
        reason: 'drop',
      }).ok,
    ).toBe(true);
  });
});
