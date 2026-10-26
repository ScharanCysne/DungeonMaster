import { describe, expect, it } from 'vitest';
import { entry, fixture, receipt, rejects, value } from './testing/fixtures.js';

describe('search', () => {
  it.each(['perception', 'investigation'] as const)(
    'reveals discoverable floor items and containers with %s',
    (skill) => {
      const engine = fixture();
      const checkId = receipt(engine, skill);
      expect(
        value(
          engine.search({ actor: 'char:player', area: 'loc:room', checkId }),
        ).revealed,
      ).toEqual(['container:secret', 'item:secret']);
    },
  );
  it('emits EntityRevealed for every discovery and spends the receipt', () => {
    const engine = fixture();
    const checkId = receipt(engine, 'perception');
    const result = engine.search({
      actor: 'char:player',
      area: 'loc:room',
      checkId,
    });
    expect({
      result,
      receipt: engine.state.receipts.get(checkId),
    }).toMatchObject({
      result: {
        ok: true,
        events: [{ type: 'EntityRevealed' }, { type: 'EntityRevealed' }],
        facts: [expect.stringContaining('searched')],
      },
      receipt: { spent: true },
    });
  });
  it('leaves contents of a closed container hidden', () => {
    const engine = fixture();
    value(
      engine.search({
        actor: 'char:player',
        area: 'loc:room',
        checkId: receipt(engine, 'perception'),
      }),
    );
    expect(engine.state.items.get('item:quest')?.hidden).toBe(true);
  });
  it('reveals discoverable contents of an accessible open container', () => {
    const engine = fixture((seed) => {
      entry(seed.containers, 'container:box').opened = true;
      entry(seed.items, 'item:quest').findDc = 5;
    });
    expect(
      value(
        engine.search({
          actor: 'char:player',
          area: 'loc:room',
          checkId: receipt(engine, 'perception'),
        }),
      ).revealed,
    ).toContain('item:quest');
  });
  it('does not reveal concealed items carried by another character', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:secret').holder = {
        kind: 'character',
        id: 'char:seller',
      };
    });
    expect(
      value(
        engine.search({
          actor: 'char:player',
          area: 'loc:room',
          checkId: receipt(engine, 'perception'),
        }),
      ).revealed,
    ).not.toContain('item:secret');
  });
  it('leaves entities above the check total hidden', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:secret').findDc = 25;
    });
    const checkId = receipt(engine, 'perception');
    expect(
      value(engine.search({ actor: 'char:player', area: 'loc:room', checkId }))
        .revealed,
    ).not.toContain('item:secret');
  });
  it('leaves entities with no findDc hidden', () => {
    const engine = fixture((seed) => {
      delete entry(seed.items, 'item:secret').findDc;
    });
    expect(
      value(
        engine.search({
          actor: 'char:player',
          area: 'loc:room',
          checkId: receipt(engine, 'perception'),
        }),
      ).revealed,
    ).not.toContain('item:secret');
  });
  it('restricts discoveries to the requested spot bounds', () => {
    const engine = fixture((seed) => {
      seed.locations.push({
        id: 'loc:spot',
        name: 'Spot',
        summary: '',
        tags: [],
        kind: 'spot',
        lit: true,
        partOf: 'loc:room',
        tileBounds: { x: 3, y: 3, w: 1, h: 1 },
      });
    });
    expect(
      value(
        engine.search({
          actor: 'char:player',
          area: 'loc:spot',
          checkId: receipt(engine, 'perception'),
        }),
      ).revealed,
    ).toEqual(['container:secret']);
  });
  it.each([
    ['loc:missing', 'NO_SUCH_ENTITY'],
    ['loc:other', 'NOT_IN_SAME_ROOM'],
  ] as const)(
    'rejects search area %s without spending the receipt',
    (area, code) => {
      const engine = fixture();
      const checkId = receipt(engine, 'perception');
      rejects(
        engine,
        () => engine.search({ actor: 'char:player', area, checkId }),
        code,
        area,
      );
    },
  );
  it('does not reveal floor items from a different room', () => {
    const engine = fixture((seed) => {
      entry(seed.items, 'item:secret').holder = {
        kind: 'location',
        id: 'loc:other',
      };
    });
    expect(
      value(
        engine.search({
          actor: 'char:player',
          area: 'loc:room',
          checkId: receipt(engine, 'perception'),
        }),
      ).revealed,
    ).not.toContain('item:secret');
  });
});
