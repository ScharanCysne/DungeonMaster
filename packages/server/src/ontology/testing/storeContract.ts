import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Edge, EntityId } from '@dungeon/shared';
import type { OntologyStore } from '../OntologyStore.js';
import { edgeKey } from '../mutations.js';
import { OntologyStoreError } from '../neo4jErrors.js';
import { project } from '../projector.js';
import { graphSnapshot, seedRecord } from './fixtures.js';
import { runEdgeContract } from './edgeContract.js';
import { runQueryContract } from './queryContract.js';

export function runStoreContract(
  name: string,
  makeStore: () => OntologyStore | Promise<OntologyStore>,
  options: { teardown?: (store: OntologyStore) => void | Promise<void> } = {},
) {
  describe(`${name} contract`, () => {
    let store: OntologyStore;
    beforeEach(async () => {
      store = await makeStore();
      await store.apply(project(seedRecord()));
    });
    afterEach(async () => {
      await options.teardown?.(store);
    });

    it('reads missing nodes and clears all nodes and relationships', async () => {
      expect(await store.getNode('char:missing')).toBeUndefined();
      await store.clear();
      await store.clear();
      expect(await graphSnapshot(store)).toEqual({ nodes: [], edges: [] });
      await store.apply([]);
      expect(await store.nodes()).toEqual([]);
    });
    it('rolls back the entire batch on failure', async () => {
      const before = await graphSnapshot(store);
      await expect(
        store.apply([
          { type: 'setNodeProps', id: 'char:player', props: { hp: 1 } },
          { type: 'removeNode', id: 'item:rock' },
          { type: 'setNodeProps', id: 'char:missing', props: { hp: 1 } },
        ]),
      ).rejects.toThrow('Cannot update missing node char:missing.');
      expect(await graphSnapshot(store)).toEqual(before);
    });
    it.each<EntityId>(['char:player', 'item:rock'])(
      'rejects an edge missing endpoint %s and rolls back the entire batch',
      async (id) => {
        await store.apply([{ type: 'removeNode', id }]);
        const before = await graphSnapshot(store);
        const batch = store.apply([
          { type: 'setNodeProps', id: 'char:peer', props: { hp: 1 } },
          { type: 'removeNode', id: 'fact:rumour' },
          {
            type: 'upsertEdge',
            edge: {
              type: 'CARRIES',
              from: 'char:player',
              to: 'item:rock',
              properties: {},
              createdBy: 'engine',
              createdAtBeat: 1,
            },
          },
        ]);
        await expect(batch).rejects.toBeInstanceOf(OntologyStoreError);
        await expect(batch).rejects.toMatchObject({
          kind: 'missing_endpoint',
          message:
            'Cannot create CARRIES edge: missing endpoint (char:player, item:rock).',
        });
        expect(await graphSnapshot(store)).toEqual(before);
      },
    );
    it('requires endpoint nodes before their edges within a batch', async () => {
      const item = await store.getNode('item:rock');
      if (!item || !('weight' in item)) throw new Error('Missing item fixture');
      const node = { ...item, id: 'item:new' } satisfies typeof item;
      const edge: Edge = {
        type: 'CARRIES',
        from: 'char:player',
        to: node.id,
        properties: {},
        createdBy: 'engine',
        createdAtBeat: 1,
      };
      const before = await graphSnapshot(store);
      await expect(
        store.apply([
          { type: 'setNodeProps', id: 'char:player', props: { hp: 1 } },
          { type: 'upsertEdge', edge },
          { type: 'upsertNode', node },
        ]),
      ).rejects.toMatchObject({ kind: 'missing_endpoint' });
      expect(await graphSnapshot(store)).toEqual(before);
      await store.apply([
        { type: 'upsertNode', node },
        { type: 'upsertEdge', edge },
      ]);
      expect(await store.getNode(node.id)).toEqual(node);
      expect(await store.edges({ types: ['CARRIES'], to: node.id })).toEqual([
        edge,
      ]);
    });
    it('returns consistent graph/query reads and propagates callback errors', async () => {
      const before = await graphSnapshot(store);
      await store.read(async (reader) => {
        expect(await graphSnapshot(reader)).toEqual(before);
        expect(await reader.getNode('char:player')).toEqual(
          await store.getNode('char:player'),
        );
        expect(await graphSnapshot(reader)).toEqual(before);
      });
      const failure = new Error('Query failed');
      await expect(store.read(() => Promise.reject(failure))).rejects.toBe(
        failure,
      );
      expect(await graphSnapshot(store)).toEqual(before);
    });
    it('replaces nodes, preserves creation provenance, merges partial updates, and is idempotent', async () => {
      const node = await store.getNode('item:rock');
      if (!node || !('weight' in node)) throw new Error('Missing item fixture');
      await store.apply([
        { type: 'upsertNode', node: { ...node, damage: '1d4', weight: 0.125 } },
      ]);
      await store.apply([
        {
          type: 'upsertNode',
          node: { ...node, name: 'Changed', createdBy: 'dm', createdAtBeat: 9 },
        },
      ]);
      expect(await store.getNode(node.id)).toEqual({
        ...node,
        name: 'Changed',
      });
      await store.apply([
        {
          type: 'setNodeProps',
          id: 'char:player',
          props: { hp: 1, tile: { x: 3, y: 2 } },
        },
      ]);
      expect(await store.getNode('char:player')).toMatchObject({
        hp: 1,
        tile: { x: 3, y: 2 },
        createdBy: 'seed',
      });
      const seed = project(seedRecord());
      await store.apply(seed);
      const before = await graphSnapshot(store);
      await store.apply(seed);
      expect(await graphSnapshot(store)).toEqual(before);
    });
    it('orders nodes by id and edges by edgeKey using code units', async () => {
      const node = await store.getNode('fact:rumour');
      if (!node || !('statement' in node))
        throw new Error('Missing fact fixture');
      for (const id of ['fact:a0', 'fact:a-b', 'fact:a', 'fact:9'] as const) {
        await store.apply([
          { type: 'upsertNode', node: { ...node, id } },
          {
            type: 'upsertEdge',
            edge: {
              type: 'ABOUT',
              from: id,
              to: 'char:player',
              properties: {},
              createdBy: 'seed',
              createdAtBeat: 0,
            },
          },
        ]);
      }
      const ids = (await store.nodes()).map((node) => node.id);
      const keys = (await store.edges()).map(edgeKey);
      expect(ids).toEqual([...ids].sort());
      expect(keys).toEqual([...keys].sort());
    });
    runEdgeContract(() => store);
    runQueryContract(() => store);
  });
}
