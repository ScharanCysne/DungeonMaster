import { configSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from './AnthropicProvider.js';
import { LlmRequestError } from './errors.js';
import {
  fakeKey,
  fakeTransport,
  providerFor,
  request,
  wireMessage,
} from './testing.js';
import type { LlmRequest, LlmRole } from './types.js';

const roles: LlmRole[] = [
  'dm',
  'story',
  'peer',
  'npc_voice',
  'generator',
  'critic',
  'recap',
];
it.each(roles)(
  'sends the correct model, effort, caching and fallbacks for %s',
  async (role) => {
    const { provider, bodies, betaHeaders } = providerFor(wireMessage());
    await provider.complete({ ...request, role });
    const body = bodies[0];
    const model = role === 'dm' ? 'claude-opus-5-5' : 'claude-sonnet-5-5';
    expect(body).toMatchObject({
      model,
      max_tokens: 64,
      output_config: {
        effort: role === 'dm' || role === 'story' ? 'medium' : 'low',
      },
      system: [
        {
          type: 'text',
          text: 'Stable rules',
          cache_control:
            role === 'dm'
              ? { type: 'ephemeral', ttl: '1h' }
              : { type: 'ephemeral' },
        },
      ],
    });
    for (const field of [
      'temperature',
      'top_p',
      'top_k',
      'thinking',
      'tool_choice',
      'tools',
    ])
      expect(body).not.toHaveProperty(field);
    expect(body).toHaveProperty('fallbacks', 'default');
    expect(betaHeaders[0]).toContain('server-side-fallback-2026-07-01');
  },
);

it('uses configurable model and effort overrides', async () => {
  const transport = fakeTransport(Response.json(wireMessage()));
  const config = configSchema.parse({
    models: { peer: 'custom' },
    efforts: { peer: 'high' },
    timeouts: { providerRetries: 0 },
    prices: {
      ...configSchema.parse({}).prices,
      custom: {
        input: 1,
        output: 1,
        cacheRead: 1,
        cacheWrite5m: 1,
        cacheWrite1h: 1,
      },
    },
  });
  const provider = new AnthropicProvider({
    apiKey: fakeKey,
    config,
    fetch: transport.fetch,
  });
  await provider.complete(request);
  expect(transport.bodies[0]).toMatchObject({
    model: 'custom',
    output_config: { effort: 'high' },
  });
});

it('sends strict tools with auto choice and a final-tool 1h breakpoint', async () => {
  const { provider, bodies } = providerFor(wireMessage());
  await provider.complete({
    ...request,
    role: 'dm',
    system: [{ text: 'dynamic', cache: false }],
    tools: [
      { name: 'first', description: 'First', inputSchema: z.strictObject({}) },
      {
        name: 'move',
        description: 'Move actor',
        inputSchema: z.strictObject({ target: z.string() }),
        cache: true,
      },
    ],
  });
  expect(bodies[0]).toMatchObject({
    tool_choice: { type: 'auto' },
    system: [{ type: 'text', text: 'dynamic' }],
    tools: [
      {
        name: 'first',
        strict: true,
        input_schema: {
          type: 'object',
          additionalProperties: false,
          required: [],
        },
      },
      {
        name: 'move',
        strict: true,
        input_schema: {
          type: 'object',
          properties: { target: { type: 'string' } },
          additionalProperties: false,
          required: ['target'],
        },
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ],
  });
  expect(JSON.stringify(bodies[0])).not.toContain(fakeKey);
});

it('honors explicit cache TTLs in tools -> system render order', async () => {
  const { provider, bodies } = providerFor(wireMessage());
  await provider.complete({
    ...request,
    role: 'dm',
    system: [
      { text: 'long', cache: true, ttl: '1h' },
      { text: 'short', cache: true, ttl: '5m' },
    ],
  });
  expect(bodies[0]).toHaveProperty('system', [
    {
      type: 'text',
      text: 'long',
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
    { type: 'text', text: 'short', cache_control: { type: 'ephemeral' } },
  ]);
});

const invalidRequests: LlmRequest[] = [
  { ...request, maxTokens: 0 },
  { ...request, timeoutMs: 0 },
  { ...request, messages: [] },
  { ...request, messages: [{ role: 'assistant', content: 'prefill' }] },
  {
    ...request,
    system: Array.from({ length: 5 }, () => ({ text: 'prefix', cache: true })),
  },
  {
    ...request,
    system: [
      { text: 'short', cache: true },
      { text: 'long', cache: true, ttl: '1h' },
    ],
  },
  {
    ...request,
    role: 'dm',
    tools: [
      {
        name: 'optional',
        description: '',
        inputSchema: z.strictObject({ field: z.string().optional() }),
      },
    ],
  },
  {
    ...request,
    role: 'dm',
    tools: [
      {
        name: 'loose',
        description: '',
        inputSchema: z.looseObject({ field: z.string() }),
      },
    ],
  },
  {
    ...request,
    role: 'dm',
    tools: [{ name: 'scalar', description: '', inputSchema: z.string() }],
  },
  {
    ...request,
    role: 'dm',
    tools: [
      {
        name: 'short',
        description: '',
        inputSchema: z.strictObject({}),
        cache: true,
        ttl: '5m',
      },
    ],
  },
];
it.each(invalidRequests)(
  'rejects invalid request before transport: %#',
  async (invalid) => {
    const { provider, fetch } = providerFor();
    await expect(provider.complete(invalid)).rejects.toBeInstanceOf(
      LlmRequestError,
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('omits refusal fallbacks for a model that does not offer them', async () => {
  const transport = fakeTransport(Response.json(wireMessage()));
  const provider = new AnthropicProvider({
    apiKey: fakeKey,
    config: configSchema.parse({
      models: { peer: 'claude-haiku-5-5' },
      timeouts: { providerRetries: 0 },
    }),
    fetch: transport.fetch,
  });
  await provider.complete({ ...request, role: 'peer' });
  expect(transport.bodies[0]).not.toHaveProperty('fallbacks');
});
