import type { LlmResponse, LlmRole } from './types.js';

export class LlmError extends Error {
  constructor(
    readonly role: LlmRole,
    readonly model: string,
    detail: string,
    readonly response?: LlmResponse,
  ) {
    super(`LLM ${role} (${model}): ${detail}`);
    this.name = new.target.name;
  }
}
export class LlmUnavailableError extends LlmError {}
export class LlmRequestError extends LlmError {}
export class LlmValidationError extends LlmError {}
export class LlmRefusalError extends LlmError {
  constructor(
    role: LlmRole,
    model: string,
    readonly category: string | null = null,
    response?: LlmResponse,
  ) {
    super(role, model, 'final refusal', response);
  }
}
