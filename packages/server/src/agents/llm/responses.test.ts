import { expect, it } from 'vitest';
import { z } from 'zod';
import { LlmRefusalError, LlmValidationError } from './errors.js';
import {
  providerFor,
  request,
  resultSchema,
  wireMessage,
  wireUsage,
} from './testing.js';
import { appendToolResults, validateToolInput } from './toolTurns.js';
import type { LlmContentBlock, ToolResultBlock } from './types.js';

it.each(['peer', 'story'] as const)(
  'parses Zod v4 structured output for %s with the installed SDK',
  async (role) => {
    const { provider, bodies } = providerFor(
      wireMessage({ content: [{ type: 'text', text: '{"ok":true}' }] }),
    );
    const result = await provider.complete({
      ...request,
      role,
      outputFormat: resultSchema,
    });
    expect(result.parsedOutput?.ok).toBe(true);
    expect(bodies[0]).toMatchObject({
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            additionalProperties: false,
          },
        },
      },
    });
  },
);

it.each([
  { content: [] },
  {
    content: [
      { type: 'thinking', thinking: 'only thinking', signature: 'sig' },
    ],
  },
  { content: [{ type: 'text', text: 'not json' }] },
  { content: [{ type: 'text', text: '{"ok":"wrong"}' }] },
  { content: [{ type: 'text', text: '{"ok":true,"extra":1}' }] },
  {
    content: [{ type: 'text', text: '{"ok":true}' }],
    stop_reason: 'max_tokens',
  },
  {
    content: [{ type: 'text', text: '{"ok":true}' }],
    stop_reason: 'pause_turn',
  },
])(
  'rejects absent, invalid or incomplete parsed output: %#',
  async (overrides) => {
    const { provider } = providerFor(wireMessage(overrides));
    await expect(
      provider.complete({ ...request, outputFormat: resultSchema }),
    ).rejects.toBeInstanceOf(LlmValidationError);
  },
);

it.each(['dm', 'peer', 'story'] as const)(
  'checks refusal before exposing content for %s',
  async (role) => {
    const { provider } = providerFor(
      wireMessage({
        stop_reason: 'refusal',
        stop_details: { category: 'general_harms' },
        content: [{ type: 'text', text: 'Refusal prose is not JSON.' }],
      }),
    );
    const input =
      role === 'dm'
        ? { ...request, role }
        : { ...request, role, outputFormat: resultSchema };
    const failure = provider.complete(input);
    await expect(failure).rejects.toBeInstanceOf(LlmRefusalError);
    await expect(failure).rejects.toMatchObject({
      category: 'general_harms',
      response: {
        content: [{ type: 'text', text: 'Refusal prose is not JSON.' }],
        stopReason: 'refusal',
      },
    });
  },
);

it('preserves the entire assistant turn including thinking and fallback boundaries', async () => {
  const content: LlmContentBlock[] = [
    { type: 'thinking', thinking: 'unchanged', signature: 'signature' },
    {
      type: 'fallback',
      from: { model: 'claude-opus-5-5' },
      to: { model: 'claude-sonnet-5-5' },
      trigger: { type: 'refusal' },
    },
    { type: 'redacted_thinking', data: 'opaque' },
    { type: 'text', text: 'Using tools' },
    { type: 'tool_use', id: 'one', name: 'move', input: { target: 'door' } },
    { type: 'tool_use', id: 'two', name: 'move', input: { target: 7 } },
  ];
  const { provider, bodies } = providerFor(
    wireMessage({
      content,
      model: 'claude-sonnet-5-5',
      stop_reason: 'tool_use',
    }),
    wireMessage(),
  );
  const response = await provider.complete({ ...request, role: 'dm' });
  const tool = {
    name: 'move',
    description: '',
    inputSchema: z.strictObject({ target: z.string() }),
  };
  const calls = response.content.filter((block) => block.type === 'tool_use');
  const results: ToolResultBlock[] = calls.map((call) => {
    const valid = validateToolInput(tool, call).success;
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: valid ? 'moved' : 'invalid input',
      is_error: !valid,
    };
  });
  const messages = appendToolResults(request.messages, response, results);
  await provider.complete({ ...request, role: 'dm', messages });
  expect(response.fallbackUsed).toBe(true);
  expect(messages.at(-2)?.content).toEqual(content);
  expect(bodies[1]).toHaveProperty('messages', [
    ...request.messages,
    { role: 'assistant', content },
    { role: 'user', content: results },
  ]);
  expect(results.map((result) => result.is_error)).toEqual([false, true]);
  expect(() =>
    appendToolResults(request.messages, response, results.slice(1)),
  ).toThrow('exactly one result');
  const first = results[0];
  if (!first) throw new Error('Expected a tool result');
  expect(() =>
    appendToolResults(request.messages, response, [first, first]),
  ).toThrow('exactly one result');
});

it('records per-model fallback iteration usage without double billing', async () => {
  const { provider } = providerFor(
    wireMessage({
      model: 'claude-sonnet-5-5',
      usage: {
        ...wireUsage,
        iterations: [
          { ...wireUsage, model: 'claude-opus-5-5', type: 'message' },
          {
            ...wireUsage,
            model: 'claude-sonnet-5-5',
            type: 'fallback_message',
          },
        ],
      },
    }),
  );
  const result = await provider.complete({ ...request, role: 'dm' });
  expect(result.fallbackUsed).toBe(true);
  expect(result.model).toBe('claude-sonnet-5-5');
  expect(result.costUsd).toBeCloseTo(
    (40 + 100 + 8 + 50 + 160 + 20 + 50 + 8 + 25 + 80) / 1_000_000,
  );
  expect(result.usage.cacheCreation).toEqual({
    ephemeral5mInputTokens: 10,
    ephemeral1hInputTokens: 20,
  });
});
