import { Neo4jError } from 'neo4j-driver';
import { expect, it } from 'vitest';
import { rethrowNeo4jError, OntologyStoreError } from './neo4jErrors.js';

const context = { uri: 'bolt://localhost:7687', user: 'neo4j' };
it.each([
  ['ServiceUnavailable', 'unavailable'],
  ['SessionExpired', 'unavailable'],
  ['Neo.ClientError.Transaction.TransactionTimedOut', 'unavailable'],
  ['Neo.TransientError.General.DatabaseUnavailable', 'unavailable'],
  ['Neo.ClientError.Schema.ConstraintValidationFailed', 'constraint_violation'],
  ['Neo.ClientError.Security.Unauthorized', 'auth'],
  ['Neo.ClientError.Statement.SyntaxError', 'driver'],
])(
  'classifies %s, keeps its cause, and does not echo driver messages',
  (code, kind) => {
    const cause = new Neo4jError(
      'Sensitive driver details',
      'ServiceUnavailable',
      '50N42',
      'test error',
    );
    cause.code = code ?? '';
    try {
      rethrowNeo4jError(cause, context);
    } catch (error) {
      expect(error).toBeInstanceOf(OntologyStoreError);
      if (!(error instanceof OntologyStoreError)) throw error;
      expect(error.kind).toBe(kind);
      expect(error.cause).toBe(cause);
      expect(error.message).not.toContain('Sensitive driver details');
      expect(error.message).toContain(context.uri);
      if (kind === 'auth') expect(error.message).toContain(context.user);
    }
  },
);
it('rethrows unknown and already typed errors unchanged', () => {
  for (const error of [
    new Error('Callback'),
    new OntologyStoreError('missing_node', 'Missing'),
  ]) {
    try {
      rethrowNeo4jError(error, context);
    } catch (caught) {
      expect(caught).toBe(error);
    }
  }
});
