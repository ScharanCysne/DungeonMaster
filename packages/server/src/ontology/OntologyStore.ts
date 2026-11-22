import type { Edge, EntityId } from '@dungeon/shared';
import type { EdgeFilter, GraphMutation, GraphNode } from './mutations.js';

export interface OntologyReader {
  getNode(id: EntityId): Promise<GraphNode | undefined>;
  nodes(): Promise<GraphNode[]>;
  edges(filter?: EdgeFilter): Promise<Edge[]>;
}
export interface OntologyStore extends OntologyReader {
  apply(mutations: readonly GraphMutation[]): Promise<void>;
  clear(): Promise<void>;
  read<T>(query: (reader: OntologyReader) => Promise<T>): Promise<T>;
}
