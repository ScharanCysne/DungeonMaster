import { describe, expect, it } from 'vitest';
import { entry, fixture, rejects, value } from './testing/fixtures.js';

describe('move', () => {
  it('finds a shortest four-directional path including its starting tile', () => {
    const engine = fixture();
    expect(
      value(engine.move({ actor: 'char:player', to: 'container:box' })).path,
    ).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
  it('chooses the nearest reachable free tile in a destination location', () => {
    const engine = fixture();
    expect(
      value(engine.move({ actor: 'char:player', to: 'loc:other' })),
    ).toMatchObject({
      from: 'loc:room',
      to: 'loc:other',
      tile: { x: 4, y: 1 },
    });
  });
  it('uses a one-tile path when already adjacent', () => {
    const engine = fixture((seed) => {
      entry(seed.characters, 'char:player').tile = { x: 1, y: 2 };
    });
    expect(
      value(engine.move({ actor: 'char:player', to: 'container:box' })).path,
    ).toEqual([{ x: 1, y: 2 }]);
  });
  it('updates location to the most specific spot within a room', () => {
    const engine = fixture((seed) => {
      seed.locations.push({
        id: 'loc:spot',
        name: 'Spot',
        summary: '',
        tags: [],
        kind: 'spot',
        lit: true,
        partOf: 'loc:other',
        tileBounds: { x: 4, y: 1, w: 1, h: 1 },
      });
    });
    expect(
      value(engine.move({ actor: 'char:player', to: 'loc:other' })).to,
    ).toBe('loc:spot');
  });
  it('routes around other characters including unconscious characters', () => {
    const engine = fixture((seed) => {
      const blocker = entry(seed.characters, 'char:watcher');
      blocker.tile = { x: 1, y: 1 };
      blocker.conscious = false;
    });
    expect(
      value(engine.move({ actor: 'char:player', to: 'loc:other' })).path,
    ).not.toContainEqual({ x: 1, y: 1 });
  });
  it('ends orthogonally adjacent to a character without occupying their tile', () => {
    const engine = fixture();
    const tile = value(
      engine.move({ actor: 'char:player', to: 'char:seller' }),
    ).tile;
    expect(Math.abs(tile.x - 3) + Math.abs(tile.y - 2)).toBe(1);
  });
  it('uses the holder’s tile when approaching a carried item', () => {
    const engine = fixture();
    const tile = value(
      engine.move({ actor: 'char:player', to: 'item:goods' }),
    ).tile;
    expect(Math.abs(tile.x - 3) + Math.abs(tile.y - 2)).toBe(1);
  });
  it('uses the first walkable location tile when approaching a floor item', () => {
    expect(
      value(fixture().move({ actor: 'char:player', to: 'item:floor' })).tile,
    ).toEqual({ x: 0, y: 1 });
  });
  it('emits the computed path and a readable movement fact', () => {
    const result = fixture().move({ actor: 'char:player', to: 'loc:other' });
    if (!result.ok) throw new Error(result.error.message);
    expect({
      event: result.events[0],
      fact: result.facts[0]?.includes('Player moved'),
    }).toMatchObject({
      event: { type: 'EntityMoved', payload: { path: result.value.path } },
      fact: true,
    });
  });
  it.each(['locked door', 'wall', 'character'] as const)(
    'rejects a corridor blocked by a %s without changes',
    (obstacle) => {
      const engine = fixture((seed, grid) => {
        grid.walkable = grid.walkable.map((row, y) => row.map(() => y === 1));
        if (obstacle === 'locked door')
          grid.doors = [{ tile: { x: 2, y: 1 }, locked: true }];
        if (obstacle === 'wall') grid.walkable[1]?.splice(2, 1, false);
        if (obstacle === 'character')
          entry(seed.characters, 'char:watcher').tile = { x: 2, y: 1 };
      });
      rejects(
        engine,
        () => engine.move({ actor: 'char:player', to: 'loc:other' }),
        'PATH_BLOCKED',
      );
    },
  );
  it('passes through an unlocked door', () => {
    const engine = fixture((_seed, grid) => {
      grid.doors = [{ tile: { x: 2, y: 1 }, locked: false }];
    });
    expect(
      value(engine.move({ actor: 'char:player', to: 'loc:other' })).path,
    ).toContainEqual({ x: 2, y: 1 });
  });
  it('rejects a destination with no walkable free tiles without changes', () => {
    const engine = fixture((_seed, grid) => {
      grid.walkable = grid.walkable.map((row) => row.map((_tile, x) => x < 4));
    });
    rejects(
      engine,
      () => engine.move({ actor: 'char:player', to: 'loc:other' }),
      'PATH_BLOCKED',
    );
  });
  it('rejects an entity whose location has no walkable anchor without changes', () => {
    const engine = fixture((seed, grid) => {
      entry(seed.items, 'item:floor').holder = {
        kind: 'location',
        id: 'loc:other',
      };
      grid.walkable = grid.walkable.map((row) => row.map((_tile, x) => x < 4));
    });
    rejects(
      engine,
      () => engine.move({ actor: 'char:player', to: 'item:floor' }),
      'PATH_BLOCKED',
      'loc:other',
    );
  });
  it('rejects a destination outside known locations without changes', () => {
    const engine = fixture((seed) => {
      entry(seed.containers, 'container:box').tile = { x: 7, y: 3 };
      entry(seed.locations, 'loc:other').tileBounds = {
        x: 4,
        y: 0,
        w: 1,
        h: 1,
      };
    });
    rejects(
      engine,
      () => engine.move({ actor: 'char:player', to: 'container:box' }),
      'PATH_BLOCKED',
    );
  });
  it.each([
    ['char:missing', 'loc:room'],
    ['char:player', 'loc:missing'],
    ['char:player', 'fact:missing'],
  ] as const)(
    'rejects missing move reference %s / %s without changes',
    (actor, to) => {
      const engine = fixture();
      rejects(engine, () => engine.move({ actor, to }), 'NO_SUCH_ENTITY');
    },
  );
  it('rejects an unconscious actor without changes', () => {
    const engine = fixture((seed) => {
      entry(seed.characters, 'char:player').conscious = false;
    });
    rejects(
      engine,
      () => engine.move({ actor: 'char:player', to: 'loc:other' }),
      'ACTOR_UNCONSCIOUS',
      'char:player',
    );
  });
});
