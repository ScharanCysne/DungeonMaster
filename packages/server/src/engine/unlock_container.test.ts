import { describe, expect, it } from 'vitest';
import { entry, fixture, receipt, rejects, value } from './testing/fixtures.js';

describe('unlock_container', () => {
  it('binds keys from seed properties and unlocks with the carried matching key', () => {
    const engine = fixture();
    value(
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'key',
        itemId: 'item:key',
      }),
    );
    expect(engine.state.containers.get('container:lockbox')).toMatchObject({
      locked: false,
      opened: false,
      keyIds: ['item:key'],
    });
  });
  it.each([
    ['force', 'athletics'],
    ['lockpick', 'sleight_of_hand'],
  ] as const)('unlocks by %s with a sufficient %s receipt', (method, skill) => {
    const engine = fixture((seed) => {
      entry(seed.containers, 'container:lockbox').lockDc = 5;
    });
    const checkId = receipt(engine, skill);
    const output = value(
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method,
        checkId,
      }),
    );
    expect({
      output,
      spent: engine.state.receipts.get(checkId)?.spent,
    }).toEqual({
      output: { containerId: 'container:lockbox', method, revealed: [] },
      spent: true,
    });
  });
  it('reveals contents when unlocked but leaves the container closed', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:quest').holder = {
        kind: 'container',
        id: 'container:lockbox',
      };
    });
    expect(
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'key',
        itemId: 'item:key',
      }),
    ).toMatchObject({
      ok: true,
      events: [
        { type: 'ContainerUnlocked', payload: { revealed: ['item:quest'] } },
      ],
      facts: [expect.stringContaining('unlocked')],
    });
  });
  it.each([
    ['item:missing', 'NO_SUCH_ENTITY'],
    ['item:rock', 'WRONG_KEY'],
    ['item:goods', 'ITEM_NOT_REACHABLE'],
  ] as const)('rejects key %s without changes', (itemId, code) => {
    const engine = fixture();
    rejects(
      engine,
      () =>
        engine.unlock_container({
          actor: 'char:player',
          container: 'container:lockbox',
          method: 'key',
          itemId,
        }),
      code,
      itemId,
    );
  });
  it('rejects a bound key that is not carried by the actor', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:key').holder = {
        kind: 'character',
        id: 'char:peer',
      };
    });
    rejects(
      engine,
      () =>
        engine.unlock_container({
          actor: 'char:player',
          container: 'container:lockbox',
          method: 'key',
          itemId: 'item:key',
        }),
      'ITEM_NOT_REACHABLE',
      'item:key',
    );
  });
  it.each([
    ['container:missing', 'NO_SUCH_ENTITY'],
    ['container:secret', 'CONTAINER_HIDDEN'],
    ['container:box', 'CONTAINER_NOT_LOCKED'],
  ] as const)('rejects unlocking %s without changes', (container, code) => {
    const engine = fixture();
    rejects(
      engine,
      () =>
        engine.unlock_container({
          actor: 'char:player',
          container,
          method: 'key',
          itemId: 'item:key',
        }),
      code,
      container,
    );
  });
  it('rejects unlocking a container in another room', () => {
    const engine = fixture((seed) => {
      entry(seed.containers, 'container:lockbox').location = 'loc:other';
    });
    rejects(
      engine,
      () =>
        engine.unlock_container({
          actor: 'char:player',
          container: 'container:lockbox',
          method: 'key',
          itemId: 'item:key',
        }),
      'NOT_IN_SAME_ROOM',
    );
  });
  it.each(['lockpick', 'force'] as const)(
    'requires a receipt for %s',
    (method) => {
      const engine = fixture();
      rejects(
        engine,
        () =>
          engine.unlock_container({
            actor: 'char:player',
            container: 'container:lockbox',
            method,
          }),
        'RECEIPT_REQUIRED',
        'undefined',
      );
    },
  );
  it('rejects an unspecified lock DC for a rolled unlock', () => {
    const engine = fixture((seed) => {
      delete entry(seed.containers, 'container:lockbox').lockDc;
    });
    const checkId = receipt(engine, 'athletics');
    rejects(
      engine,
      () =>
        engine.unlock_container({
          actor: 'char:player',
          container: 'container:lockbox',
          method: 'force',
          checkId,
        }),
      'LOCK_DC_REQUIRED',
      'container:lockbox',
    );
  });
  it('rejects a successful check below the container lock DC without spending it', () => {
    const engine = fixture((seed) => {
      entry(seed.containers, 'container:lockbox').lockDc = 25;
    });
    const checkId = receipt(engine, 'athletics');
    rejects(
      engine,
      () =>
        engine.unlock_container({
          actor: 'char:player',
          container: 'container:lockbox',
          method: 'force',
          checkId,
        }),
      'RECEIPT_FAILED',
      '25',
    );
  });
  it('unlocks when the receipt total exactly equals lockDc', () => {
    const engine = fixture();
    let checkId = '';
    for (let i = 0; i < 100; i++) {
      const check = value(
        engine.skill_check({
          actor: 'char:player',
          skill: 'athletics',
          dc: 10,
          advantage: 'none',
          reason: '',
        }),
      );
      if (check.total === 10) {
        checkId = check.checkId;
        break;
      }
    }
    expect(
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'force',
        checkId,
      }).ok,
    ).toBe(true);
  });
});
