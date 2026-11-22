import { Neo4jError } from 'neo4j-driver';

export type StoreErrorKind =
  | 'unavailable'
  | 'constraint_violation'
  | 'auth'
  | 'missing_node'
  | 'missing_endpoint'
  | 'driver';

export class OntologyStoreError extends Error {
  constructor(
    readonly kind: StoreErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OntologyStoreError';
  }
}
export class Neo4jUnavailableError extends OntologyStoreError {
  constructor(message: string, cause: Error) {
    super('unavailable', message, { cause });
    this.name = 'Neo4jUnavailableError';
  }
}
export class Neo4jConstraintViolationError extends OntologyStoreError {
  constructor(message: string, cause: Error) {
    super('constraint_violation', message, { cause });
    this.name = 'Neo4jConstraintViolationError';
  }
}
export class Neo4jAuthError extends OntologyStoreError {
  constructor(message: string, cause: Error) {
    super('auth', message, { cause });
    this.name = 'Neo4jAuthError';
  }
}
export function rethrowNeo4jError(
  error: unknown,
  context: { uri: string; user: string },
): never {
  if (!(error instanceof Neo4jError)) throw error;
  const help = `Neo4j at ${context.uri}; run docker compose up -d neo4j.`;
  if (error.code.startsWith('Neo.ClientError.Security.'))
    throw new Neo4jAuthError(
      `Authentication/authorization failed for user ${context.user}. ${help} Check .env credentials.`,
      error,
    );
  if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed')
    throw new Neo4jConstraintViolationError(
      `Constraint violation. ${help}`,
      error,
    );
  if (
    error.code === 'ServiceUnavailable' ||
    error.code === 'SessionExpired' ||
    /(?:Connection|Timeout|TimedOut|DatabaseUnavailable)/.test(error.code)
  )
    throw new Neo4jUnavailableError(`Unavailable or timed out. ${help}`, error);
  throw new OntologyStoreError(
    'driver',
    `Neo4j operation failed (${error.code}). ${help}`,
    { cause: error },
  );
}
