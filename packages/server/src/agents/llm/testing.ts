import { configSchema } from '@dungeon/shared';
import { vi } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from './AnthropicProvider.js';
import type { LlmFetch, LlmRequest } from './types.js';

export const fakeKey = 'sk-ant-test-NEVER-LOG-THIS';
export const testConfig = configSchema.parse({
  timeouts: { providerRetries: 0 },
});
export const request = {
  role: 'peer',
  system: [{ text: 'Stable rules', cache: true }],
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 64,
} satisfies LlmRequest;
export const wireUsage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_creation_input_tokens: 30,
  cache_read_input_tokens: 40,
  cache_creation: {
    ephemeral_5m_input_tokens: 10,
    ephemeral_1h_input_tokens: 20,
  },
};
export function wireMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    stop_sequence: null,
    content: [{ type: 'text', text: 'OK', citations: null }],
    usage: wireUsage,
    ...overrides,
  };
}
export function fakeTransport(...responses: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  const betaHeaders: (string | null)[] = [];
  const fetch = vi.fn<LlmFetch>(async (input, init) => {
    const outgoing = new Request(input, init);
    betaHeaders.push(outgoing.headers.get('anthropic-beta'));
    const raw: unknown = JSON.parse(await outgoing.text());
    bodies.push(z.record(z.string(), z.unknown()).parse(raw));
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fake transport call');
    return response;
  });
  return { fetch, bodies, betaHeaders };
}
export function providerFor(...messages: Record<string, unknown>[]) {
  const transport = fakeTransport(
    ...messages.map((message) => Response.json(message)),
  );
  return {
    ...transport,
    provider: new AnthropicProvider({
      apiKey: fakeKey,
      config: testConfig,
      fetch: transport.fetch,
    }),
  };
}
export const resultSchema = z.strictObject({ ok: z.boolean() });
