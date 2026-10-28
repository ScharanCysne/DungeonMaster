import type { PauseReason } from '@dungeon/shared';
import { LlmUnavailableError } from '../agents/llm/errors.js';
import { OntologyStoreError } from '../ontology/neo4jErrors.js';

export class SessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'SessionError';
  }
}

export function pauseReason(error: unknown): PauseReason {
  if (error instanceof LlmUnavailableError) return 'llm_unavailable';
  if (error instanceof OntologyStoreError && error.kind === 'unavailable')
    return 'graph_unavailable';
  return 'internal_error';
}
