import { z } from 'zod';
import type { ToolSchema } from '../llm/types.js';
import type { ToolRegistry } from './types.js';

type JsonSchema = z.core.JSONSchema.JSONSchema;

// The Messages API caps strict tools per request (20) and also rejects a
// request whose combined strict grammar is too large; all 25 tools exceed it.
// Strict mode is kept for the calls the DM makes most, measured against the
// live API (adding contested_check tips it over). Every other tool is still
// validated with zod, and a bad call comes back to the DM as an error.
export const MAX_STRICT_TOOLS = 20;
const STRICT_TOOLS: ReadonlySet<string> = new Set([
  'move',
  'skill_check',
  'search',
  'open_container',
  'unlock_container',
  'transfer_item',
  'attack',
  'apply_damage',
  'hide',
  'heal',
  'set_attitude',
  'share_fact',
  'voice_npc',
  'narrate',
]);
export function isStrictTool(name: string): boolean {
  return STRICT_TOOLS.has(name);
}

export function sourceSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, {
    io: 'input',
    reused: 'inline',
    cycles: 'throw',
  });
}

function strictSchema(schema: JsonSchema): JsonSchema {
  const result = { ...schema };
  delete result.$schema;
  delete result.default;
  // Keep constraints in Zod; strict APIs support a smaller validation vocabulary.
  for (const key of [
    'pattern',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'multipleOf',
  ])
    delete result[key];
  if (result.$ref || result.patternProperties)
    throw new Error(
      'Strict tool schemas cannot contain references or patternProperties',
    );
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = result[key];
    if (branches) result[key] = branches.map(strictSchema);
  }
  if (result.items && typeof result.items === 'object') {
    result.items = Array.isArray(result.items)
      ? result.items.map((item) =>
          typeof item === 'boolean' ? item : strictSchema(item),
        )
      : strictSchema(result.items);
  }
  if (result.type === 'object') {
    // Optional fields stay out of `required` rather than becoming nullable
    // unions: strict mode accepts that, and the API caps union-typed
    // parameters across a request.
    result.properties = Object.fromEntries(
      Object.entries(result.properties ?? {}).map(([name, property]) => {
        if (typeof property === 'boolean')
          throw new Error('Boolean property schemas are unsupported');
        return [name, strictSchema(property)];
      }),
    );
    result.required = (result.required ?? []).filter(
      (name) => name in (result.properties ?? {}),
    );
    result.additionalProperties = false;
  }
  return result;
}

export function strictInputSchema(schema: z.ZodType) {
  const result = strictSchema(sourceSchema(schema));
  if (result.type !== 'object')
    throw new Error('Tool inputs must be object schemas');
  return { ...result, type: 'object' as const };
}

export function normalizeOptionalNulls(
  value: unknown,
  schema: JsonSchema,
): unknown {
  if (Array.isArray(value)) {
    const item = schema.items;
    return item && typeof item === 'object' && !Array.isArray(item)
      ? value.map((entry: unknown) => normalizeOptionalNulls(entry, item))
      : value;
  }
  if (value === null || typeof value !== 'object') return value;
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]: [string, unknown]) => {
      const property = schema.properties?.[key];
      if (!property || typeof property === 'boolean') return [[key, entry]];
      if (entry === null && !required.has(key)) return [];
      return [[key, normalizeOptionalNulls(entry, property)]];
    }),
  );
}

export function toolDefinitionsForApi(registry: ToolRegistry) {
  return registry.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: strictInputSchema(tool.input),
    strict: isStrictTool(tool.name),
  }));
}

export function toolSchemasForProvider(registry: ToolRegistry): ToolSchema[] {
  return registry.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input,
    apiInputSchema: strictInputSchema(tool.input),
    strict: isStrictTool(tool.name),
  }));
}
