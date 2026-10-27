import { toolSchemas } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { providerFor, wireMessage } from '../llm/testing.js';
import { toolRegistry } from './registry.js';
import {
  toolDefinitionsForApi,
  toolSchemasForProvider,
  strictInputSchema,
  isStrictTool,
  MAX_STRICT_TOOLS,
} from './jsonSchema.js';
import { executeToolCall } from './execute.js';
import { fixture, rejects } from './testing/fixtures.js';

function walk(schema: unknown): void {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema)) {
    schema.forEach(walk);
    return;
  }
  for (const keyword of [
    '$ref',
    '$defs',
    'patternProperties',
    'allOf',
    'oneOf',
    'if',
    'then',
    'else',
    'pattern',
    'minimum',
    'maximum',
    'minLength',
  ])
    expect(schema).not.toHaveProperty(keyword);
  if ('type' in schema && schema.type === 'object') {
    expect(schema).toHaveProperty('additionalProperties', false);
    expect(schema).toHaveProperty('required');
    if (
      !('properties' in schema) ||
      typeof schema.properties !== 'object' ||
      schema.properties === null ||
      !('required' in schema)
    )
      throw new Error('Missing object fields');
    for (const name of schema.required as string[])
      expect(Object.keys(schema.properties)).toContain(name);
  }
  Object.values(schema).forEach(walk);
}

it('covers the entire catalogue in fixed prompt order with shared schemas', () => {
  expect(toolRegistry.map((tool) => tool.name)).toEqual([
    'move',
    'skill_check',
    'contested_check',
    'search',
    'open_container',
    'unlock_container',
    'transfer_item',
    'equip',
    'unequip',
    'hide',
    'attack',
    'apply_damage',
    'heal',
    'pass_turn',
    'end_combat',
    'set_attitude',
    'share_fact',
    'create_fact',
    'set_quest_status',
    'generate_item',
    'generate_npc',
    'generate_feature',
    'generate_story',
    'voice_npc',
    'narrate',
  ]);
  expect(toolRegistry.map((tool) => tool.name).sort()).toEqual(
    Object.keys(toolSchemas).sort(),
  );
  for (const tool of toolRegistry) {
    expect(tool.input).toBe(toolSchemas[tool.name].input);
    expect(tool.output).toBe(toolSchemas[tool.name].output);
    expect(tool.description.length).toBeGreaterThan(100);
  }
  expect(toolRegistry.find((tool) => tool.name === 'voice_npc')?.kind).toBe(
    'soft',
  );
});

it.each(toolRegistry)(
  '$name converts to a strict schema at every depth',
  (tool) => {
    const api = toolDefinitionsForApi([tool]);
    expect(api[0]).toMatchObject({
      name: tool.name,
      description: tool.description,
      strict: isStrictTool(tool.name),
    });
    walk(api[0]?.input_schema);
    expect(api).toEqual(toolDefinitionsForApi([tool]));
  },
);

it('leaves optional fields out of required instead of adding null unions', () => {
  const schema = strictInputSchema(toolSchemas.generate_item.input);
  expect(schema.required).not.toContain('constraints');
  const constraints = schema.properties?.constraints;
  if (!constraints || typeof constraints === 'boolean')
    throw new Error('Missing constraints');
  expect(constraints).toMatchObject({
    type: 'object',
    additionalProperties: false,
  });
  expect(JSON.stringify(schema)).not.toContain('"type":"null"');
  expect(() => strictInputSchema(z.string())).toThrow(
    'Tool inputs must be object schemas',
  );
});

it('passes all converted definitions through the actual provider with auto choice', async () => {
  const { provider, bodies, fetch } = providerFor(wireMessage());
  await provider.complete({
    role: 'dm',
    system: [],
    tools: toolSchemasForProvider(toolRegistry),
    messages: [{ role: 'user', content: 'Reply with OK; do not call tools.' }],
    maxTokens: 64,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(bodies[0]).toMatchObject({
    tools: toolDefinitionsForApi(toolRegistry),
    tool_choice: { type: 'auto' },
  });
});

it.each(toolRegistry)(
  '$name rejects malformed JSON input without side effects',
  async (tool) => {
    const { ctx, generators, npcVoice } = await fixture();
    await rejects(ctx, tool.name, { unexpected: true }, 'INVALID_INPUT');
    for (const generator of Object.values(generators))
      expect(generator).not.toHaveBeenCalled();
    expect(npcVoice.voice).not.toHaveBeenCalled();
  },
);

it('names invalid fields and expected values, including refinement failures', async () => {
  const { ctx } = await fixture();
  await rejects(
    ctx,
    'move',
    { actor: 7, to: 'loc:room' },
    'INVALID_INPUT',
    'actor',
  );
  await rejects(
    ctx,
    'skill_check',
    { actor: 'char:player', dc: 5, advantage: 'none', reason: '' },
    'INVALID_INPUT',
    'exactly one of skill or ability',
  );
  await rejects(
    ctx,
    'unlock_container',
    { actor: 'char:player', container: 'container:lockbox', method: 'key' },
    'INVALID_INPUT',
    'itemId',
  );
  await rejects(
    ctx,
    'transfer_item',
    {
      actor: 'char:player',
      item: 'item:goods',
      to: 'char:player',
      reason: 'buy',
    },
    'INVALID_INPUT',
    'price',
  );
  await rejects(ctx, 'not_a_tool', {}, 'UNKNOWN_TOOL', 'not_a_tool');
});

it('normalizes optional API nulls recursively without mutating input or allowing required nulls', async () => {
  const { ctx, generators } = await fixture();
  const input = {
    brief: 'A charm',
    placement: 'loc:room',
    constraints: { kind: null, maxRarity: null },
  };
  expect((await executeToolCall('generate_item', input, ctx)).ok).toBe(true);
  expect(generators.generate_item).toHaveBeenCalledWith(
    { brief: 'A charm', placement: 'loc:room', constraints: {} },
    ctx,
  );
  expect(input.constraints).toEqual({ kind: null, maxRarity: null });
  await rejects(
    ctx,
    'move',
    { actor: null, to: 'loc:room' },
    'INVALID_INPUT',
    'actor',
  );
});

it('sends no more strict tools than the API accepts', () => {
  const strictTools = toolDefinitionsForApi(toolRegistry).filter(
    (tool) => tool.strict,
  );
  expect(strictTools.length).toBeLessThanOrEqual(MAX_STRICT_TOOLS);
});

it('marks the same tools strict for the provider as for the API', () => {
  expect(
    toolSchemasForProvider(toolRegistry).map((tool) => tool.strict),
  ).toEqual(toolDefinitionsForApi(toolRegistry).map((tool) => tool.strict));
});
