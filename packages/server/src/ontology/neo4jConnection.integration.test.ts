import { expect, it } from 'vitest';
import { z } from 'zod';
import { loadNeo4jConfig } from '../config/neo4j.js';
import { Neo4jStore } from './Neo4jStore.js';
import { Neo4jUnavailableError } from './neo4jErrors.js';

it('reports an unreachable URI and startup instructions without exposing the credential', async () => {
  loadNeo4jConfig();
  const uri = 'bolt://localhost:1';
  const config = loadNeo4jConfig({ ...process.env, NEO4J_URI: uri });
  try {
    const unexpected = await Neo4jStore.connect(config, {
      connectionTimeoutMs: 250,
      maxTransactionRetryTimeMs: 0,
    });
    await unexpected.close();
    expect.fail('Expected connection failure');
  } catch (error) {
    expect(error instanceof Neo4jUnavailableError).toBe(true);
    if (!(error instanceof Neo4jUnavailableError)) throw error;
    expect(error.message).toContain(uri);
    expect(error.message).toContain('docker compose up -d neo4j');
    expect(error.cause instanceof Error).toBe(true);
    expect(
      error.message.includes(z.string().parse(process.env.NEO4J_PASSWORD)),
    ).toBe(false);
  }
});
