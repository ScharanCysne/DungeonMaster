import type { Edge, EntityId } from '@dungeon/shared';
import {
  compareEdges,
  compareNodes,
  edgeKey,
  matchesEdge,
} from './mutations.js';
import { OntologyStoreError } from './neo4jErrors.js';
import type { EdgeFilter, GraphMutation, GraphNode } from './mutations.js';
import type { OntologyReader, OntologyStore } from './OntologyStore.js';

export class MemoryStore implements OntologyStore {
  #nodes = new Map<EntityId, GraphNode>();
  #edges = new Map<string, Edge>();

  getNode(id: EntityId): Promise<GraphNode | undefined> {
    return Promise.resolve(structuredClone(this.#nodes.get(id)));
  }
  nodes(): Promise<GraphNode[]> {
    return Promise.resolve(
      structuredClone([...this.#nodes.values()].sort(compareNodes)),
    );
  }
  edges(filter: EdgeFilter = {}): Promise<Edge[]> {
    return Promise.resolve(
      structuredClone(
        [...this.#edges.values()]
          .filter((edge) => matchesEdge(edge, filter))
          .sort(compareEdges),
      ),
    );
  }
  clear(): Promise<void> {
    this.#nodes.clear();
    this.#edges.clear();
    return Promise.resolve();
  }
  read<T>(query: (reader: OntologyReader) => Promise<T>): Promise<T> {
    const snapshot = this.#copy();
    return query(snapshot);
  }
  #copy(): MemoryStore {
    const copy = new MemoryStore();
    copy.#nodes = structuredClone(this.#nodes);
    copy.#edges = structuredClone(this.#edges);
    return copy;
  }
  apply(mutations: readonly GraphMutation[]): Promise<void> {
    return Promise.resolve().then(() => {
      const next = this.#copy();
      for (const mutation of structuredClone(mutations)) next.#apply(mutation);
      this.#nodes = next.#nodes;
      this.#edges = next.#edges;
    });
  }
  #apply(mutation: GraphMutation): void {
    switch (mutation.type) {
      case 'upsertNode': {
        const prior = this.#nodes.get(mutation.node.id);
        this.#nodes.set(
          mutation.node.id,
          prior
            ? {
                ...mutation.node,
                createdBy: prior.createdBy,
                createdAtBeat: prior.createdAtBeat,
              }
            : mutation.node,
        );
        break;
      }
      case 'setNodeProps': {
        const node = this.#nodes.get(mutation.id);
        if (!node)
          throw new OntologyStoreError(
            'missing_node',
            `Cannot update missing node ${mutation.id}.`,
          );
        this.#nodes.set(mutation.id, { ...node, ...mutation.props });
        break;
      }
      case 'removeNode':
        this.#nodes.delete(mutation.id);
        this.#apply({ type: 'removeEdges', filter: { touching: mutation.id } });
        break;
      case 'upsertEdge': {
        const edge = mutation.edge;
        if (!this.#nodes.has(edge.from) || !this.#nodes.has(edge.to))
          throw new OntologyStoreError(
            'missing_endpoint',
            `Cannot create ${edge.type} edge: missing endpoint (${edge.from}, ${edge.to}).`,
          );
        const key = edgeKey(edge);
        const prior = this.#edges.get(key);
        if (prior) {
          edge.createdBy = prior.createdBy;
          edge.createdAtBeat = prior.createdAtBeat;
          if (
            prior.type === 'KNOWS' &&
            edge.type === 'KNOWS' &&
            prior.properties.retractedAtBeat !== undefined
          )
            edge.properties.retractedAtBeat = prior.properties.retractedAtBeat;
        }
        this.#edges.set(key, edge);
        break;
      }
      case 'removeEdges':
        for (const [key, edge] of this.#edges)
          if (matchesEdge(edge, mutation.filter)) this.#edges.delete(key);
        break;
      case 'retractSupersededKnows': {
        const superseded = new Set(
          [...this.#edges.values()]
            .filter(
              (edge) =>
                edge.type === 'SUPERSEDES' && edge.from === mutation.fact,
            )
            .map((edge) => edge.to),
        );
        for (const edge of this.#edges.values())
          if (
            edge.type === 'KNOWS' &&
            edge.from === mutation.learner &&
            superseded.has(edge.to)
          )
            edge.properties.retractedAtBeat = Math.min(
              edge.properties.retractedAtBeat ?? mutation.beat,
              mutation.beat,
            );
        break;
      }
    }
  }
}
