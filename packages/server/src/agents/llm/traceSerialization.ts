import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LlmRequest } from './types.js';

export type TraceValue =
  | null
  | boolean
  | number
  | string
  | TraceValue[]
  | { [key: string]: TraceValue };

export function redactText(value: string, secrets: readonly string[]): string {
  let text = value;
  for (const secret of secrets)
    if (secret) text = text.replaceAll(secret, '[REDACTED]');
  return text.replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED]');
}

export function traceValue(
  value: unknown,
  secrets: readonly string[],
): TraceValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return redactText(value, secrets);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value))
    return value.map((item: unknown) => traceValue(item, secrets));
  if (typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [
        redactText(key, secrets),
        /^(api[_-]?key|anthropic_api_key|authorization|password|credentials)$/i.test(
          key,
        )
          ? '[REDACTED]'
          : traceValue(item, secrets),
      ]),
  );
}

export function serializeRequest(
  request: LlmRequest,
  secrets: readonly string[],
): TraceValue {
  return traceValue(
    {
      ...request,
      ...(request.outputFormat
        ? { outputFormat: z.toJSONSchema(request.outputFormat) }
        : {}),
      ...(request.tools
        ? {
            tools: request.tools.map((tool) => ({
              ...tool,
              inputSchema: z.toJSONSchema(tool.inputSchema),
            })),
          }
        : {}),
    },
    secrets,
  );
}

export function promptHash(request: TraceValue): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}
