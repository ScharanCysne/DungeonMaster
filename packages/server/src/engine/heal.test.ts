import { describe, expect, it } from 'vitest';
import { entry, fixture, receipt, rejects, value } from './testing/fixtures.js';

describe('heal', () => {
  it('consumes a carried potion and emits Healed with the item source', () => {
    const engine = fixture((seed) => {
      entry(seed.characters, 'char:player').hp = 1;
    });
    const result = engine.heal({
      target: 'char:player',
      dice: '1d4',
      source: 'item:potion',
    });
    expect({
      result,
      exists: engine.state.items.has('item:potion'),
      carried: engine.state.characters
        .get('char:player')
        ?.inventory.includes('item:potion'),
    }).toMatchObject({
      result: {
        ok: true,
        events: [{ type: 'Healed', payload: { source: 'item:potion' } }],
        facts: [expect.stringContaining('regained')],
      },
      exists: false,
      carried: false,
    });
  });
  it('accepts a potion carried by another character present in the room', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:potion').holder = {
        kind: 'character',
        id: 'char:peer',
      };
    });
    expect(
      engine.heal({
        target: 'char:player',
        dice: '1d4',
        source: 'item:potion',
      }),
    ).toMatchObject({ ok: true, events: [{ actor: 'char:peer' }] });
  });
  it('unequips a potion before consuming it', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:potion',
        slot: 'off_hand',
      }),
    );
    const result = engine.heal({
      target: 'char:player',
      dice: '1d4',
      source: 'item:potion',
    });
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: 'ItemUnequipped' }, { type: 'Healed' }],
    });
  });
  it('heals from zero HP and restores consciousness', () => {
    const engine = fixture((seed) => {
      const actor = entry(seed.characters, 'char:player');
      actor.hp = 0;
      actor.conscious = false;
    });
    expect(
      value(
        engine.heal({ target: 'char:player', dice: '1d4+20', source: 'rest' }),
      ),
    ).toMatchObject({ hp: 12, amount: 12, conscious: true });
  });
  it('clamps healing at maxHp and reports only the HP actually regained', () => {
    const engine = fixture((seed) => {
      entry(seed.characters, 'char:player').hp = 11;
    });
    expect(
      value(
        engine.heal({ target: 'char:player', dice: '1d4+20', source: 'rest' }),
      ),
    ).toMatchObject({ hp: 12, amount: 1 });
  });
  it('does not let negative healing damage or wake a zero-HP target', () => {
    const engine = fixture((seed) => {
      const actor = entry(seed.characters, 'char:player');
      actor.hp = 0;
      actor.conscious = false;
    });
    expect(
      value(
        engine.heal({ target: 'char:player', dice: '1d4-100', source: 'rest' }),
      ),
    ).toMatchObject({ hp: 0, amount: 0, conscious: false });
  });
  it.each(['medicine', 'religion'] as const)(
    'accepts a successful %s receipt from a present healer',
    (skill) => {
      const engine = fixture();
      const checkId = receipt(engine, skill, 'char:peer');
      const result = engine.heal({
        target: 'char:player',
        dice: '1d4',
        source: { checkId },
      });
      expect({
        result,
        spent: engine.state.receipts.get(checkId)?.spent,
      }).toMatchObject({
        result: {
          ok: true,
          events: [{ actor: 'char:peer', payload: { source: { checkId } } }],
        },
        spent: true,
      });
    },
  );
  it('rejects a spent healing receipt without changes', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'medicine');
    value(
      engine.heal({ target: 'char:player', dice: '1d4', source: { checkId } }),
    );
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: '1d4',
          source: { checkId },
        }),
      'RECEIPT_SPENT',
      checkId,
    );
  });
  it('rejects a healer who became unconscious after rolling', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'medicine', 'char:peer');
    value(
      engine.apply_damage({
        target: 'char:peer',
        dice: '1d4+100',
        cause: 'fall',
      }),
    );
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: '1d4',
          source: { checkId },
        }),
      'ACTOR_UNCONSCIOUS',
      'char:peer',
    );
  });
  it('rejects a receipt’s healer in another room', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'medicine', 'char:other');
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: '1d4',
          source: { checkId },
        }),
      'NOT_IN_SAME_ROOM',
    );
  });
  it.each([
    ['item:missing', 'NO_SUCH_ENTITY'],
    ['item:rock', 'INVALID_HEAL_SOURCE'],
  ] as const)('rejects healing source %s without changes', (source, code) => {
    const engine = fixture();
    rejects(
      engine,
      () => engine.heal({ target: 'char:player', dice: '1d4', source }),
      code,
      source,
    );
  });
  it('rejects healing an unknown target without consuming the potion', () => {
    const engine = fixture();
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:missing',
          dice: '1d4',
          source: 'item:potion',
        }),
      'NO_SUCH_ENTITY',
      'char:missing',
    );
  });
  it.each(['location', 'container'] as const)(
    'rejects a healing item held by a %s',
    (kind) => {
      const engine = fixture((seed) => {
        entry(seed.items, 'item:potion').holder =
          kind === 'location'
            ? { kind, id: 'loc:room' }
            : { kind, id: 'container:box' };
      });
      rejects(
        engine,
        () =>
          engine.heal({
            target: 'char:player',
            dice: '1d4',
            source: 'item:potion',
          }),
        'ITEM_NOT_REACHABLE',
        'item:potion',
      );
    },
  );
  it('rejects a healing item carried in another room', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:potion').holder = {
        kind: 'character',
        id: 'char:other',
      };
    });
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: '1d4',
          source: 'item:potion',
        }),
      'NOT_IN_SAME_ROOM',
    );
  });
  it('rejects bad healing dice without consuming an equipped item or emitting events', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:potion',
        slot: 'off_hand',
      }),
    );
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: 'bad',
          source: 'item:potion',
        }),
      'INVALID_DICE',
      'bad',
    );
  });
  it('rejects bad healing dice without spending a valid receipt', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'medicine');
    rejects(
      engine,
      () =>
        engine.heal({
          target: 'char:player',
          dice: 'bad',
          source: { checkId },
        }),
      'INVALID_DICE',
      'bad',
    );
  });
});
