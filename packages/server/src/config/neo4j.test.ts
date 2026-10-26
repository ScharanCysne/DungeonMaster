import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadNeo4jConfig, Neo4jConfigError } from './neo4j.js';

const env = {
  NEO4J_URI: 'bolt://localhost:7687',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'test-only-credential',
};
describe('Neo4j configuration', () => {
  it('names all missing variables without exposing input', () => {
    expect(() => loadNeo4jConfig({})).toThrow(
      'NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD',
    );
  });
  it.each(['NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD'])(
    'rejects missing or empty %s',
    (variable) => {
      expect(() => loadNeo4jConfig({ ...env, [variable]: undefined })).toThrow(
        variable,
      );
      expect(() => loadNeo4jConfig({ ...env, [variable]: '' })).toThrow(
        variable,
      );
    },
  );
  it.each([
    'http://localhost:7687',
    'not a uri',
    'bolt:missing-host',
    'bolt://localhost:7687/not-a-database-path',
    'bolt://user:credential@localhost:7687',
    'bolt://localhost:7687?secret=value',
  ])('rejects invalid URI %s without echoing it', (uri) => {
    try {
      loadNeo4jConfig({ ...env, NEO4J_URI: uri });
      expect.fail('Expected configuration error');
    } catch (error) {
      expect(error).toBeInstanceOf(Neo4jConfigError);
      if (!(error instanceof Error)) throw error;
      expect(error.message).toBe(
        'Missing or invalid Neo4j configuration: NEO4J_URI. Check .env.',
      );
    }
  });
  it('keeps config stringification, JSON and inspection redacted', () => {
    const config = loadNeo4jConfig(env);
    expect(config.uri).toBe(env.NEO4J_URI);
    expect(config.user).toBe(env.NEO4J_USER);
    for (const output of [
      String(config),
      JSON.stringify(config),
      inspect(config),
      inspect(config, { showHidden: true }),
    ])
      expect(output.includes(env.NEO4J_PASSWORD)).toBe(false);
  });
});
