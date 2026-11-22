export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function requireValue<T>(value: T | undefined, id: string): T {
  if (value === undefined) {
    throw new EngineError(
      'NO_SUCH_ENTITY',
      `${id}: expected an existing entity.`,
    );
  }
  return value;
}

export function requireRule(
  condition: boolean,
  code: string,
  message: string,
): void {
  if (!condition) throw new EngineError(code, message);
}
