import { describe, expect, it } from 'vitest';
import { fixture, rejects, value } from './testing/fixtures.js';

describe('equipment', () => {
  it.each(['main_hand', 'off_hand', 'armor', 'accessory'] as const)(
    'equips a carried item in %s',
    (slot) => {
      const engine = fixture();
      value(engine.equip({ actor: 'char:player', item: 'item:rock', slot }));
      expect(engine.state.characters.get('char:player')?.equipped[slot]).toBe(
        'item:rock',
      );
    },
  );
  it('emits ItemEquipped and a readable fact', () => {
    expect(
      fixture().equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    ).toMatchObject({
      ok: true,
      events: [{ type: 'ItemEquipped' }],
      facts: [expect.stringContaining('Player equipped')],
    });
  });
  it('unequips the specified slot while retaining the carried item', () => {
    const engine = fixture();
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
    expect({
      slots: engine.state.characters.get('char:player')?.equipped,
      carries: engine.state.characters
        .get('char:player')
        ?.inventory.includes('item:rock'),
    }).toEqual({ slots: {}, carries: true });
  });
  it('emits ItemUnequipped and a readable fact', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    expect(
      engine.unequip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    ).toMatchObject({
      ok: true,
      events: [{ type: 'ItemUnequipped' }],
      facts: [expect.stringContaining('Player unequipped')],
    });
  });
  it('rejects equipping into an occupied slot without changes', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    rejects(
      engine,
      () =>
        engine.equip({
          actor: 'char:player',
          item: 'item:key',
          slot: 'main_hand',
        }),
      'SLOT_OCCUPIED',
      'main_hand',
    );
  });
  it('rejects equipping one item in two slots without changes', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    rejects(
      engine,
      () =>
        engine.equip({
          actor: 'char:player',
          item: 'item:rock',
          slot: 'off_hand',
        }),
      'ITEM_ALREADY_EQUIPPED',
      'item:rock',
    );
  });
  it('rejects unequipping from the wrong slot without changes', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:rock',
        slot: 'main_hand',
      }),
    );
    rejects(
      engine,
      () =>
        engine.unequip({
          actor: 'char:player',
          item: 'item:rock',
          slot: 'off_hand',
        }),
      'ITEM_NOT_EQUIPPED',
      'off_hand',
    );
  });
  for (const command of ['equip', 'unequip'] as const) {
    it(`${command} rejects an unknown item without changes`, () => {
      const engine = fixture();
      rejects(
        engine,
        () =>
          engine[command]({
            actor: 'char:player',
            item: 'item:missing',
            slot: 'main_hand',
          }),
        'NO_SUCH_ENTITY',
        'item:missing',
      );
    });
    it(`${command} rejects an item carried by another actor without changes`, () => {
      const engine = fixture();
      rejects(
        engine,
        () =>
          engine[command]({
            actor: 'char:player',
            item: 'item:goods',
            slot: 'main_hand',
          }),
        'ITEM_NOT_REACHABLE',
        'item:goods',
      );
    });
  }
});
