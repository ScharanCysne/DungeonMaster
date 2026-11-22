import { expect, test } from 'vitest';
import { graphModel, neo4jLink, dmOnlyEdge } from './graphModel';
import { graphChanges, edgeKey } from '../store/dev';
import { createClientStore } from '../store';
import { debugGraph } from '../testing/dev';
import { snapshot } from '../testing/fixtures';

function world() {
  const store = createClientStore();
  store.getState().receive(snapshot, 0);
  return store.getState().world;
}
const changes = { nodes: [], edges: [] };
test('graph type colours and fixed concentric input order are deterministic', () => {
  const model = graphModel(debugGraph, world(), false, changes);
  const reversed = graphModel(
    {
      nodes: [...debugGraph.nodes].reverse(),
      edges: [...debugGraph.edges].reverse(),
    },
    world(),
    false,
    changes,
  );
  expect(model).toEqual(reversed);
  expect(model.layout.name).toBe('concentric');
  expect(model.nodes.find((node) => node.id === 'char:player')?.color).toBe(
    '#f5b041',
  );
  expect(model.nodes.find((node) => node.id === 'item:quill')?.color).toBe(
    '#58d68d',
  );
  expect(model.nodes.find((node) => node.id === 'fact:quill')?.color).toBe(
    '#f4d03f',
  );
});
test('last-beat changes use provenance, node mutations, edge properties and visible event IDs', () => {
  const updated = {
    ...debugGraph,
    nodes: debugGraph.nodes.map((node) => ({ ...node, summary: 'Changed' })),
    edges: debugGraph.edges.map((edge) => ({ ...edge, createdAtBeat: 2 })),
  };
  const diff = graphChanges(debugGraph, updated, 2);
  const model = graphModel(updated, world(), false, diff);
  expect(model.nodes.every((node) => node.changed)).toBe(true);
  expect(
    model.edges.every(
      (edge) => edge.changed && edge.dashed && edge.color === '#9b1c1c',
    ),
  ).toBe(true);
  expect(
    graphModel(debugGraph, world(), false, changes, ['char:player']).nodes.find(
      (node) => node.id === 'char:player',
    )?.changed,
  ).toBe(true);
});
test('DM-only relationships are dashed only in DM view unless changed', () => {
  const visible = graphModel(debugGraph, world(), false, changes);
  const dm = graphModel(debugGraph, world(), true, changes);
  expect(visible.edges.every((edge) => !edge.dashed)).toBe(true);
  expect(
    dm.edges.find((edge) => edge.edge.from === 'char:hidden')?.dashed,
  ).toBe(true);
  expect(
    dmOnlyEdge(
      {
        type: 'CARRIES',
        from: 'char:brann',
        to: 'item:quill',
        createdBy: 'seed',
        createdAtBeat: 0,
        properties: {},
      },
      world(),
    ),
  ).toBe(true);
  const edge = debugGraph.edges[0];
  if (!edge) throw new Error('Missing fixture');
  expect(visible.edges.some((item) => item.id === edgeKey(edge))).toBe(true);
});
test('Neo4j Browser URL prefills a one-hop query with quoted focus IDs', () => {
  const url = new URL(neo4jLink(['char:player', 'container:box']));
  expect(url.origin + url.pathname).toBe('http://localhost:7474/browser/');
  expect(url.searchParams.get('cmd')).toBe('edit');
  expect(url.searchParams.get('arg')).toContain(
    '["char:player","container:box"]',
  );
  expect(url.searchParams.get('arg')).toContain('OPTIONAL MATCH (n)-[r]-(m)');
});
