import { describe, expect, it } from 'vitest';
import { episodeSeedSchema, validateSeedReferences } from '@dungeon/shared';
import { entry } from '../engine/testing/fixtures.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { project } from '../ontology/projector.js';
import { checkConsistency, loadEpisode, tiledMapSchema } from './index.js';
import { objectId, objectsIn } from './tiled.js';
import { seedGraph, seedLoaded } from './seedGraph.js';

const content = await loadEpisode();

describe('Episode N content', () => {
  it('parses the real seed without missing references or map/sprite problems', () => {
    expect(episodeSeedSchema.parse(content.seed)).toEqual(content.seed);
    expect(validateSeedReferences(content.seed)).toEqual([]);
    expect(content.problems).toEqual([]);
    expect(content.counts).toEqual({
      locations: 8,
      characters: 9,
      items: 19,
      containers: 6,
      facts: 20,
      quests: 4,
      factions: 3,
    });
  });
  it('preserves the clue gates and epistemic differences', () => {
    const { seed } = content;
    expect(entry(seed.containers, 'container:floorboard')).toMatchObject({
      hidden: true,
      findDc: 10,
    });
    expect(entry(seed.containers, 'container:old-barrel')).toMatchObject({
      hidden: true,
      findDc: 15,
      locked: true,
      lockDc: 15,
    });
    expect(entry(seed.items, 'item:iron-key').properties).toContain(
      'key_for:container:old-barrel',
    );
    expect(entry(seed.facts, 'fact:letter-cellar').about).toContain(
      'item:wax-letter',
    );
    expect(entry(seed.facts, 'fact:rumour-stranger')).toMatchObject({
      truth: false,
      knownBy: [{ character: 'char:wren', confidence: 0.8 }],
    });
    expect(entry(seed.facts, 'fact:odo-hid-quill').knownBy).toEqual([
      { character: 'char:brann', confidence: 0.6 },
      { character: 'char:tobb', confidence: 0.3 },
      { character: 'char:stranger', confidence: 0.9 },
    ]);
  });
  it.each([
    ['border wall', 0, 0, false],
    ['counter', 5, 3, false],
    ['shelf', 1, 1, false],
    ['shelf gap', 2, 1, true],
    ['hearth', 14, 0, false],
    ['table', 5, 6, false],
    ['kitchen counter', 22, 9, false],
    ['kitchen wall', 18, 10, false],
    ['kitchen door', 18, 11, true],
    ['entrance door', 12, 15, true],
    ['rug', 12, 9, true],
    ['trapdoor', 21, 13, true],
    ['stage', 22, 2, true],
    ['stairs', 1, 6, true],
    ['old barrel', 24, 13, true],
  ] as const)('has correct walkability at %s', (_name, x, y, walkable) => {
    expect(content.grid.walkable[y]?.[x]).toBe(walkable);
  });
  it('detects a character on a wall', () => {
    const seed = structuredClone(content.seed);
    entry(seed.characters, 'char:kael').tile = { x: 0, y: 0 };
    expect(checkConsistency(seed, content.map, content.sprites)).toContain(
      'char:kael: non-walkable tile (0, 0).',
    );
  });
  it('detects unknown sprite tags even when an override exists', () => {
    const seed = structuredClone(content.seed);
    entry(seed.characters, 'char:kael').tags.push('missing-sprite');
    expect(checkConsistency(seed, content.map, content.sprites)).toContain(
      'char:kael: unknown sprite tag "missing-sprite".',
    );
  });
  it('detects mismatched entity positions', () => {
    const map = structuredClone(content.map);
    const kael = objectsIn(map, 'entities').find(
      (object) => objectId(object) === 'char:kael',
    );
    if (!kael) throw new Error('Missing Kael map object.');
    kael.x += 16;
    expect(checkConsistency(content.seed, map, content.sprites)).toContain(
      'char:kael: map position (13, 9) disagrees with seed (12, 9).',
    );
  });
  it('detects outside-room placement and mismatched room bounds', () => {
    const seed = structuredClone(content.seed);
    entry(seed.characters, 'char:kael').location = 'loc:bar';
    entry(seed.locations, 'loc:bar').tileBounds.w = 8;
    expect(checkConsistency(seed, content.map, content.sprites)).toEqual(
      expect.arrayContaining([
        'char:kael: tile (12, 9) outside room loc:bar.',
        'loc:bar: tileBounds disagree with map rooms layer.',
      ]),
    );
  });
  it('detects a room assignment hidden by the overlapping common-room rectangle', () => {
    const seed = structuredClone(content.seed);
    entry(seed.characters, 'char:marta').location = 'loc:common-room';
    expect(checkConsistency(seed, content.map, content.sprites)).toContain(
      'char:marta: tile belongs to room loc:kitchen, not loc:common-room.',
    );
  });
  it('detects both directions of missing entity ids', () => {
    const map = structuredClone(content.map);
    const object = objectsIn(map, 'entities')[0];
    if (!object) throw new Error('Missing map entities.');
    object.properties = [{ name: 'id', type: 'string', value: 'char:missing' }];
    expect(checkConsistency(content.seed, map, content.sprites)).toEqual(
      expect.arrayContaining([
        'char:kael: missing from map entities layer.',
        'char:missing: map entity missing from seed.',
      ]),
    );
  });
  it('detects missing and extra sprite overrides', () => {
    const sprites = structuredClone(content.sprites);
    delete sprites.overrides['item:quill'];
    sprites.overrides['item:missing'] = 'kenney-1-bit:0';
    expect(checkConsistency(content.seed, content.map, sprites)).toEqual(
      expect.arrayContaining([
        'item:quill: missing explicit sprite override.',
        'item:missing: sprite override missing from seed.',
      ]),
    );
  });
  it('projects SeedLoaded into MemoryStore with expected nodes and ownership', async () => {
    const store = new MemoryStore();
    await store.apply(project(seedLoaded(content.seed)));
    expect(await store.nodes()).toHaveLength(69);
    expect(
      await store.edges({ types: ['CONTAINS'], to: 'item:quill' }),
    ).toMatchObject([{ from: 'container:old-barrel' }]);
    expect(await store.edges({ types: ['HAS_SECRET'] })).toHaveLength(7);
    const counts = await seedGraph(content.seed, store);
    expect(counts.nodes).toBe(69);
    expect(counts.edges).toBe((await store.edges()).length);
  });
});

describe('Tiled input boundary', () => {
  it('reports missing object id properties as schema issues', () => {
    const map = structuredClone(content.map);
    const object = objectsIn(map, 'entities')[0];
    if (!object) throw new Error('Missing map entities.');
    object.properties = [];
    expect(tiledMapSchema.safeParse(map).success).toBe(false);
  });
  it('rejects missing layers, malformed data and out-of-range gids', () => {
    const map = structuredClone(content.map);
    expect(
      tiledMapSchema.safeParse({ ...map, layers: map.layers.slice(1) }).success,
    ).toBe(false);
    const floor = map.layers.find((layer) => layer.type === 'tilelayer');
    if (!floor || floor.type !== 'tilelayer')
      throw new Error('Missing tile layer.');
    floor.data[0] = 1079;
    expect(tiledMapSchema.safeParse(map).success).toBe(false);
    floor.data.shift();
    expect(tiledMapSchema.safeParse(map).success).toBe(false);
  });
  it('rejects duplicate ids, shifted layers and unaligned rectangles', () => {
    const map = structuredClone(content.map);
    const rooms = objectsIn(map, 'rooms');
    const room = rooms[0];
    if (!room) throw new Error('Missing rooms.');
    rooms.push(structuredClone(room));
    expect(tiledMapSchema.safeParse(map).success).toBe(false);
    rooms.pop();
    room.width -= 1;
    expect(tiledMapSchema.safeParse(map).success).toBe(false);
    const layer = content.map.layers[0];
    expect(
      tiledMapSchema.safeParse({
        ...content.map,
        layers: [{ ...layer, offsetx: 16 }, ...content.map.layers.slice(1)],
      }).success,
    ).toBe(false);
  });
});
