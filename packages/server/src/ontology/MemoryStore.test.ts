import { describe, expect, it } from 'vitest';
import { seededStore, graphSnapshot } from './testing/fixtures.js';

describe('MemoryStore transactions', () => {
  it('isolates caller-owned nodes and edges, and clears all state', async () => {
    const store = await seededStore();
    const node = await store.getNode('char:player');
    if (node) node.name = 'Changed externally';
    const edges = await store.edges({ types: ['KNOWS'] });
    if (edges[0]) edges[0].createdAtBeat = 99;
    expect((await store.getNode('char:player'))?.name).toBe('Player');
    expect((await store.edges({ types: ['KNOWS'] }))[0]?.createdAtBeat).toBe(0);
    await store.clear();
    expect(await graphSnapshot(store)).toEqual({ nodes: [], edges: [] });
  });
  it('rolls back the entire mutation batch on failure', async () => {
    const store = await seededStore();
    const before = await graphSnapshot(store);
    await expect(
      store.apply([
        { type: 'setNodeProps', id: 'char:player', props: { hp: 1 } },
        { type: 'setNodeProps', id: 'char:missing', props: { hp: 1 } },
      ]),
    ).rejects.toThrow('Cannot update missing node char:missing.');
    expect(await graphSnapshot(store)).toEqual(before);
  });
  it('keeps all reads in a query on one snapshot during concurrent writes', async () => {
    const store = await seededStore();
    await store.read(async (reader) => {
      const before = await reader.getNode('char:player');
      await store.apply([
        { type: 'setNodeProps', id: 'char:player', props: { hp: 2 } },
      ]);
      expect(await reader.getNode('char:player')).toEqual(before);
    });
    expect(await store.getNode('char:player')).toMatchObject({ hp: 2 });
  });
});
