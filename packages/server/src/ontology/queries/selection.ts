import type { EntityId, Graph, Node } from '@dungeon/shared';
import type { OntologyReader, OntologyStore } from '../OntologyStore.js';
import { debugNode } from '../projectionHelpers.js';

export interface SelectedEntity {
  node: Node;
  neighbourhood: Graph;
}
export type SelectionContext = SelectedEntity[];

export async function readSelection(
  reader: OntologyReader,
  selection: readonly EntityId[],
): Promise<SelectionContext> {
  const results: SelectionContext = [];
  for (const id of new Set(selection)) {
    const node = await reader.getNode(id);
    if (!node) continue;
    const edges = await reader.edges({ touching: id });
    const neighbours: Node[] = [];
    for (const neighbourId of new Set(
      edges.flatMap((edge) => [edge.from, edge.to]),
    )) {
      if (neighbourId === id) continue;
      const neighbour = await reader.getNode(neighbourId);
      if (neighbour) neighbours.push(debugNode(neighbour));
    }
    results.push({
      node: debugNode(node),
      neighbourhood: { nodes: neighbours, edges },
    });
  }
  return results;
}
export function selectionContext(
  store: OntologyStore,
  selection: readonly EntityId[],
): Promise<SelectionContext> {
  return store.read((reader) => readSelection(reader, selection));
}
