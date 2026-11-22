import { describe, expect, it } from 'vitest';
import { Engine } from './index.js';
import {
  entry,
  fixture,
  gridFixture,
  receipt,
  seedFixture,
  value,
} from './testing/fixtures.js';

describe('state and beat lifecycle', () => {
  it('initializes all hard-state mirrors including gold, discovery DCs and holder indexes', () => {
    const state = fixture().state;
    expect({
      player: state.characters.get('char:player'),
      container: state.containers.get('container:box'),
      item: state.items.get('item:quest'),
      combat: state.combat,
    }).toMatchObject({
      player: {
        gold: 20,
        inventory: ['item:potion', 'item:key', 'item:rock'],
        equipped: {},
        locationId: 'loc:room',
      },
      container: { contents: ['item:quest'], locationId: 'loc:room' },
      item: { findDc: 10, holder: { kind: 'container', id: 'container:box' } },
      combat: null,
    });
  });
  it('detaches the seed and grid so caller changes cannot mutate the engine', () => {
    const seed = seedFixture();
    const grid = gridFixture();
    const engine = new Engine(seed, grid, 'fixture');
    const before = engine.snapshot();
    entry(seed.characters, 'char:player').gold = 0;
    grid.walkable[0]?.splice(0, 1, false);
    expect(engine.snapshot()).toEqual(before);
  });
  it('returns detached state and snapshot values', () => {
    const engine = fixture();
    value(
      engine.open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
    );
    const before = engine.snapshot();
    engine.state.items.clear();
    const snapshot = engine.snapshot();
    snapshot.state.characters.clear();
    for (const event of snapshot.pendingEvents)
      event.candidateWitnesses.length = 0;
    expect(engine.snapshot()).toEqual(before);
  });
  it('detaches returned command payloads from engine state and buffered events', () => {
    const engine = fixture();
    const moved = value(engine.move({ actor: 'char:player', to: 'loc:other' }));
    const before = engine.snapshot();
    moved.tile.x = 999;
    moved.path.length = 0;
    const event = engine.collectEvents()[0];
    if (event) event.witnesses.length = 0;
    expect(engine.snapshot()).toEqual(before);
  });
  it('detaches nested command inputs from buffered event payloads', () => {
    const engine = fixture();
    const source = { checkId: receipt(engine, 'medicine') };
    value(engine.heal({ target: 'char:player', dice: '1d4', source }));
    const before = engine.snapshot();
    source.checkId = 'changed-by-caller';
    expect(engine.snapshot()).toEqual(before);
  });
  it('rolls back all hard state, receipts, RNG and buffered drafts exactly', () => {
    const engine = fixture();
    receipt(engine);
    engine.beginBeat(2, 1);
    const start = engine.snapshot();
    value(
      engine.search({
        actor: 'char:player',
        area: 'loc:room',
        checkId: receipt(engine, 'perception'),
      }),
    );
    value(engine.hide({ actor: 'char:player', checkId: receipt(engine) }));
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
        item: 'item:goods',
        to: 'char:player',
        reason: 'buy',
        price: 7,
      }),
    );
    value(
      engine.equip({
        actor: 'char:player',
        item: 'item:quest',
        slot: 'main_hand',
      }),
    );
    value(
      engine.apply_damage({
        target: 'char:player',
        dice: '1d4',
        cause: 'fall',
      }),
    );
    value(
      engine.heal({
        target: 'char:player',
        dice: '1d4',
        source: 'item:potion',
      }),
    );
    value(engine.move({ actor: 'char:player', to: 'loc:other' }));
    engine.rollback();
    expect(engine.snapshot()).toEqual(start);
  });
  it('replays identical rolls, receipt IDs and events after rollback', () => {
    const engine = fixture();
    const check = () =>
      engine.skill_check({
        actor: 'char:player',
        skill: 'stealth',
        dc: 5,
        advantage: 'advantage',
        reason: '',
      });
    const first = check();
    const firstSnapshot = engine.snapshot();
    value(engine.move({ actor: 'char:watcher', to: 'loc:other' }));
    engine.rollback();
    expect(check()).toEqual(first);
    expect(engine.snapshot()).toEqual(firstSnapshot);
  });
  it('changes the RNG sequence when retrying with a different attempt', () => {
    const engine = fixture();
    const dice = () =>
      Array.from(
        { length: 12 },
        () =>
          value(
            engine.heal({
              target: 'char:player',
              dice: '1d20',
              source: 'rest',
            }),
          ).roll,
      );
    const first = dice();
    engine.rollback();
    engine.beginBeat(1, 1);
    expect(dice()).not.toEqual(first);
  });
  it('clears buffered events and current-beat receipts when restarting an attempt', () => {
    const engine = fixture();
    receipt(engine);
    engine.rollback();
    engine.beginBeat(1, 1);
    expect({
      receipts: engine.successfulReceipts(),
      events: engine.collectEvents(),
    }).toEqual({ receipts: [], events: [] });
  });
  it('allows rollback to be repeated without changing the restored snapshot', () => {
    const engine = fixture();
    const before = engine.snapshot();
    receipt(engine);
    engine.rollback();
    engine.rollback();
    expect(engine.snapshot()).toEqual(before);
  });
  it.each([
    [-1, 0],
    [1, -1],
    [1.5, 0],
    [1, Infinity],
  ])('rejects invalid beat/attempt %s/%s without changes', (beat, attempt) => {
    const engine = fixture();
    const before = engine.snapshot();
    let failed = false;
    try {
      engine.beginBeat(beat, attempt);
    } catch {
      failed = true;
    }
    expect({ failed, snapshot: engine.snapshot() }).toEqual({
      failed: true,
      snapshot: before,
    });
  });
  it('rejects invalid seed references by name', () => {
    const seed = seedFixture();
    entry(seed.items, 'item:floor').holder = {
      kind: 'location',
      id: 'loc:missing',
    };
    expect(() => new Engine(seed, gridFixture(), 'fixture')).toThrow(
      'loc:missing',
    );
  });
  it('rejects a ragged walkability grid', () => {
    const grid = gridFixture();
    grid.walkable.pop();
    expect(() => new Engine(seedFixture(), grid, 'fixture')).toThrow('8x4');
  });
  it.each([
    [13, true],
    [0, true],
  ])('rejects inconsistent seed HP/consciousness %s/%s', (hp, conscious) => {
    const seed = seedFixture();
    const actor = entry(seed.characters, 'char:player');
    actor.hp = hp;
    actor.conscious = conscious;
    expect(() => new Engine(seed, gridFixture(), 'fixture')).toThrow(
      'char:player',
    );
  });
});
