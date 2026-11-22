import { describe, expect, it } from 'vitest';
import { loadEpisode } from '../content/index.js';
import { Engine } from './index.js';
import { entry, fixture, value } from './testing/fixtures.js';

const content = await loadEpisode();

describe('crowded movement', () => {
  it('lets Ilsa pass Kael in the bar gap to reach Brann, and Kael leave', () => {
    const engine = new Engine(content.seed, content.grid, 'crowded-tavern');
    engine.beginBeat(1);
    const kael = value(engine.move({ actor: 'char:kael', to: 'char:brann' }));
    const ilsa = value(engine.move({ actor: 'char:ilsa', to: 'char:brann' }));
    expect(ilsa.path).toContainEqual(kael.tile);
    expect(ilsa.to).toBe('loc:bar');
    expect(ilsa.tile).not.toEqual(kael.tile);
    // The bar is a spot on the open common-room floor, so leaving it means
    // walking out to another spot such as the hearth.
    expect(
      value(engine.move({ actor: 'char:kael', to: 'loc:hearth' })).to,
    ).toBe('loc:hearth');
  });

  it('uses the shortest free destination in the room when adjacency is blocked', () => {
    const engine = fixture((seed, grid) => {
      entry(seed.characters, 'char:seller').tile = { x: 3, y: 3 };
      entry(seed.characters, 'char:peer').tile = { x: 2, y: 3 };
      grid.walkable[2]?.splice(3, 1, false);
      entry(seed.characters, 'char:player').location = 'loc:other';
      entry(seed.characters, 'char:player').tile = { x: 4, y: 1 };
    });
    expect(
      value(engine.move({ actor: 'char:player', to: 'char:seller' })).tile,
    ).toEqual({ x: 3, y: 1 });
  });

  it('never ends on another character, even in a one-tile destination', () => {
    const engine = fixture((seed) => {
      entry(seed.locations, 'loc:other').tileBounds = {
        x: 6,
        y: 1,
        w: 1,
        h: 1,
      };
    });
    expect(
      engine.move({ actor: 'char:player', to: 'loc:other' }),
    ).toMatchObject({ ok: false, error: { code: 'PATH_BLOCKED' } });
  });
});
