import { driver, int } from 'neo4j-driver';
import type { Driver, ManagedTransaction, Session } from 'neo4j-driver';
import { timeoutsSchema } from '@dungeon/shared';
import type { EntityId, Timeouts } from '@dungeon/shared';
import { z } from 'zod';
import type { Neo4jConfig } from '../config/neo4j.js';
import type { OntologyReader, OntologyStore } from './OntologyStore.js';
import type { EdgeFilter, GraphMutation } from './mutations.js';
import { compareEdges, compareNodes } from './mutations.js';
import {
  decodeEdge,
  decodeNode,
  encodeProperties,
  nodePrefixSchema,
} from './neo4jCodec.js';
import { cypher, upsertEdges, upsertNodes } from './neo4jCypher.js';
import { OntologyStoreError, rethrowNeo4jError } from './neo4jErrors.js';
import { schemaQueries } from './neo4jSchema.js';

export interface Neo4jStoreOptions {
  timeouts?: Partial<Pick<Timeouts, 'neo4jQueryMs' | 'neo4jTransactionMs'>>;
  connectionTimeoutMs?: number;
  maxTransactionRetryTimeMs?: number;
}
function filterParams(filter: EdgeFilter) {
  return {
    types: filter.types ?? null,
    from: filter.from ?? null,
    to: filter.to ?? null,
    touching: filter.touching ?? null,
    slot: filter.slot ?? null,
  };
}
function readerFor(tx: ManagedTransaction): OntologyReader {
  return {
    async getNode(id) {
      const result = await tx.run<{ props: unknown }>(cypher.getNode, { id });
      const row = result.records[0];
      return row ? decodeNode(row.get('props')) : undefined;
    },
    async nodes() {
      const result = await tx.run<{ props: unknown }>(cypher.nodes);
      return result.records
        .map((row) => decodeNode(row.get('props')))
        .sort(compareNodes);
    },
    async edges(filter = {}) {
      const result = await tx.run<{ edge: unknown }>(
        cypher.edges,
        filterParams(filter),
      );
      return result.records
        .map((row) => decodeEdge(row.get('edge')))
        .sort(compareEdges);
    },
  };
}
async function applyMutation(
  tx: ManagedTransaction,
  mutation: GraphMutation,
): Promise<void> {
  switch (mutation.type) {
    case 'upsertNode':
      await tx.run(
        upsertNodes[nodePrefixSchema.parse(mutation.node.id.split(':')[0])],
        {
          id: mutation.node.id,
          props: encodeProperties(mutation.node),
        },
      );
      break;
    case 'setNodeProps': {
      const result = await tx.run<{ matched: unknown }>(cypher.setNodeProps, {
        id: mutation.id,
        props: encodeProperties(mutation.props),
      });
      if (z.number().parse(result.records[0]?.get('matched')) === 0)
        throw new OntologyStoreError(
          'missing_node',
          `Cannot update missing node ${mutation.id}.`,
        );
      break;
    }
    case 'removeNode':
      await tx.run(cypher.removeNode, { id: mutation.id });
      break;
    case 'upsertEdge': {
      const edge = mutation.edge;
      const result = await tx.run<{ matched: unknown }>(
        upsertEdges[edge.type],
        {
          from: edge.from,
          to: edge.to,
          props: encodeProperties({
            ...edge.properties,
            createdBy: edge.createdBy,
            createdAtBeat: edge.createdAtBeat,
          }),
        },
      );
      if (z.number().parse(result.records[0]?.get('matched')) === 0)
        throw new OntologyStoreError(
          'missing_endpoint',
          `Cannot create ${edge.type} edge: missing endpoint (${edge.from}, ${edge.to}).`,
        );
      break;
    }
    case 'removeEdges':
      await tx.run(cypher.removeEdges, filterParams(mutation.filter));
      break;
    case 'retractSupersededKnows':
      await tx.run(cypher.retract, {
        learner: mutation.learner,
        fact: mutation.fact,
        beat: int(mutation.beat),
      });
      break;
  }
}

export class Neo4jStore implements OntologyStore {
  private constructor(
    private readonly driver: Driver,
    private readonly config: Neo4jConfig,
    private readonly timeouts: Timeouts,
  ) {}

  static async connect(
    config: Neo4jConfig,
    options: Neo4jStoreOptions = {},
  ): Promise<Neo4jStore> {
    const timeouts = timeoutsSchema.parse(options.timeouts ?? {});
    const connection = driver(config.uri, config.authToken(), {
      disableLosslessIntegers: true,
      connectionTimeout: options.connectionTimeoutMs ?? timeouts.neo4jQueryMs,
      connectionAcquisitionTimeout:
        options.connectionTimeoutMs ?? timeouts.neo4jQueryMs,
      maxTransactionRetryTime:
        options.maxTransactionRetryTimeMs ?? timeouts.neo4jTransactionMs,
    });
    const store = new Neo4jStore(connection, config, timeouts);
    try {
      await connection.verifyConnectivity();
      // Neo4j schema changes are kept separate from data transactions.
      for (const query of schemaQueries)
        await store.withSession((session) =>
          session.executeWrite(
            async (tx) => {
              await tx.run(query);
            },
            { timeout: timeouts.neo4jTransactionMs },
          ),
        );
      return store;
    } catch (error) {
      await connection.close();
      rethrowNeo4jError(error, config);
    }
  }

  private async withSession<T>(
    work: (session: Session) => Promise<T>,
  ): Promise<T> {
    try {
      const session = this.driver.session();
      try {
        return await work(session);
      } finally {
        await session.close();
      }
    } catch (error) {
      rethrowNeo4jError(error, this.config);
    }
  }
  private readTransaction<T>(
    query: (reader: OntologyReader) => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return this.withSession((session) =>
      session.executeRead((tx) => query(readerFor(tx)), { timeout }),
    );
  }
  getNode(id: EntityId) {
    return this.readTransaction(
      (reader) => reader.getNode(id),
      this.timeouts.neo4jQueryMs,
    );
  }
  nodes() {
    return this.readTransaction(
      (reader) => reader.nodes(),
      this.timeouts.neo4jQueryMs,
    );
  }
  edges(filter: EdgeFilter = {}) {
    return this.readTransaction(
      (reader) => reader.edges(filter),
      this.timeouts.neo4jQueryMs,
    );
  }
  read<T>(query: (reader: OntologyReader) => Promise<T>): Promise<T> {
    return this.readTransaction(query, this.timeouts.neo4jTransactionMs);
  }
  apply(mutations: readonly GraphMutation[]): Promise<void> {
    const batch = structuredClone(mutations);
    return this.withSession((session) =>
      session.executeWrite(
        async (tx) => {
          for (const mutation of batch) await applyMutation(tx, mutation);
        },
        { timeout: this.timeouts.neo4jTransactionMs },
      ),
    );
  }
  clear(): Promise<void> {
    return this.withSession((session) =>
      session.executeWrite(
        async (tx) => {
          await tx.run(cypher.clear);
        },
        { timeout: this.timeouts.neo4jTransactionMs },
      ),
    );
  }
  async close(): Promise<void> {
    try {
      await this.driver.close();
    } catch (error) {
      rethrowNeo4jError(error, this.config);
    }
  }
}
