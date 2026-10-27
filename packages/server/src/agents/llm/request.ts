import { z } from 'zod';
import type { CacheTtl, LlmRequest, ToolSchema } from './types.js';

export function cacheControl(ttl: CacheTtl) {
  return ttl === '1h'
    ? { type: 'ephemeral' as const, ttl }
    : { type: 'ephemeral' as const };
}

export function cacheWriteTtl(request: LlmRequest): CacheTtl | undefined {
  const defaultTtl = request.role === 'dm' ? '1h' : '5m';
  const ttls = new Set(
    [...(request.tools ?? []), ...request.system]
      .filter((block) => block.cache)
      .map((block) => block.ttl ?? defaultTtl),
  );
  return ttls.size > 1 ? undefined : ([...ttls][0] ?? defaultTtl);
}

function strictObjects(schema: unknown): void {
  if (typeof schema !== 'object' || schema === null) return;
  if (Array.isArray(schema)) {
    schema.forEach(strictObjects);
    return;
  }
  if ('type' in schema && schema.type === 'object') {
    const required = 'required' in schema ? schema.required : [];
    if (
      !('additionalProperties' in schema) ||
      schema.additionalProperties !== false ||
      !('properties' in schema) ||
      typeof schema.properties !== 'object' ||
      schema.properties === null ||
      !Array.isArray(required) ||
      Object.keys(schema.properties).some((name) => !required.includes(name))
    ) {
      throw new Error(
        'Strict tool objects require additionalProperties:false and every property required',
      );
    }
  }
  Object.values(schema).forEach(strictObjects);
}

export function toolInputSchema(tool: ToolSchema) {
  const schema = z.toJSONSchema(tool.inputSchema);
  if (schema.type !== 'object')
    throw new Error('Tool inputs must be object schemas');
  // Empty objects have no required array in Zod's JSON schema output.
  const inputSchema = {
    ...schema,
    type: 'object' as const,
    required: schema.required ?? [],
  };
  strictObjects(inputSchema);
  return inputSchema;
}

export function prepareRequest(request: LlmRequest) {
  if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1)
    throw new Error('maxTokens must be positive');
  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw new Error('timeoutMs must be positive');
  }
  if (!request.messages.length || request.messages.at(-1)?.role !== 'user')
    throw new Error(
      'A final user turn is required; assistant prefill is unsupported',
    );
  const ttl = request.role === 'dm' ? '1h' : '5m';
  const tools = request.tools?.map((tool, index, all) => {
    if (tool.cache && index !== all.length - 1)
      throw new Error('Only the last tool may set a cache breakpoint');
    return {
      name: tool.name,
      description: tool.description,
      input_schema: toolInputSchema(tool),
      strict: true,
      ...(tool.cache ? { cache_control: cacheControl(tool.ttl ?? ttl) } : {}),
    };
  });
  const system = request.system.map((block) => ({
    type: 'text' as const,
    text: block.text,
    ...(block.cache ? { cache_control: cacheControl(block.ttl ?? ttl) } : {}),
  }));
  const breakpoints = [...(tools ?? []), ...system].flatMap((block) =>
    block.cache_control ? [block.cache_control] : [],
  );
  if (breakpoints.length > 4)
    throw new Error('At most four cache breakpoints are allowed');
  let shortTtlSeen = false;
  for (const breakpoint of breakpoints) {
    if (breakpoint.ttl === '1h' && shortTtlSeen)
      throw new Error('1h cache breakpoints must precede 5m breakpoints');
    if (breakpoint.ttl !== '1h') shortTtlSeen = true;
  }
  return {
    system,
    ...(tools?.length ? { tools, tool_choice: { type: 'auto' as const } } : {}),
  };
}
