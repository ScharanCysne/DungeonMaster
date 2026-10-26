import { describe, expect, it } from 'vitest';
import { seededStore, seedRecord } from './testing/fixtures.js';
import { project } from './projector.js';

describe('MemoryStore transactions', () => {
  it('isolates stored state from caller mutation of input objects', async () => {
    const store = await seededStore();
    const mutations = project(seedRecord());
    await store.apply(mutations);
    const node = mutations.find((mutation) => mutation.type === 'upsertNode');
    const edge = mutations.find((mutation) => mutation.type === 'upsertEdge');
    if (!node || !edge) throw new Error('Missing seed mutations');
    node.node.name = 'Changed externally';
    edge.edge.createdAtBeat = 99;
    expect((await store.getNode(node.node.id))?.name).not.toBe(
      'Changed externally',
    );
    expect(
      (await store.edges()).every((edge) => edge.createdAtBeat === 0),
    ).toBe(true);
  });
  it('isolates caller-owned nodes and edges', async () => {
    const store = await seededStore();
    const node = await store.getNode('char:player');
    if (node) node.name = 'Changed externally';
    const edges = await store.edges({ types: ['KNOWS'] });
    if (edges[0]) edges[0].createdAtBeat = 99;
    expect((await store.getNode('char:player'))?.name).toBe('Player');
    expect((await store.edges({ types: ['KNOWS'] }))[0]?.createdAtBeat).toBe(0);
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
