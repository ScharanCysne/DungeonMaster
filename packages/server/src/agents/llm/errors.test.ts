import { configSchema } from '@dungeon/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider.js';
import { LlmRequestError, LlmUnavailableError } from './errors.js';
import {
  fakeKey,
  fakeTransport,
  request,
  testConfig,
  wireMessage,
} from './testing.js';
import type { LlmFetch } from './types.js';

afterEach(() => vi.useRealTimers());

it.each([400, 401, 403, 404, 422, 429, 500, 529, 408, 409])(
  'maps HTTP %s without exposing server error bodies',
  async (status) => {
    const transport = fakeTransport(
      Response.json(
        {
          type: 'error',
          error: {
            type: status === 529 ? 'overloaded_error' : 'api_error',
            message: `secret=${fakeKey}`,
          },
        },
        { status },
      ),
    );
    const provider = new AnthropicProvider({
      apiKey: fakeKey,
      config: testConfig,
      fetch: transport.fetch,
    });
    const result = provider.complete(request);
    await expect(result).rejects.toBeInstanceOf(
      [408, 409, 429, 500, 529].includes(status)
        ? LlmUnavailableError
        : LlmRequestError,
    );
    await expect(result).rejects.toThrow('LLM peer (claude-haiku-5-5)');
    await result.catch((error: unknown) => {
      expect(String(error)).not.toContain(fakeKey);
      expect(JSON.stringify(error)).not.toContain(fakeKey);
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  },
);

it('maps connection failures before the generic API error class', async () => {
  const fetch: LlmFetch = vi.fn(() => Promise.reject(new Error(fakeKey)));
  const provider = new AnthropicProvider({
    apiKey: fakeKey,
    config: testConfig,
    fetch,
  });
  await expect(provider.complete(request)).rejects.toBeInstanceOf(
    LlmUnavailableError,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  { role: 'dm' as const, timeout: 60_000 },
  { role: 'peer' as const, timeout: 20_000 },
  { role: 'story' as const, timeout: 37 },
])(
  'aborts $role after its configured timeout in milliseconds',
  async ({ role, timeout }) => {
    vi.useFakeTimers();
    const fetch = vi.fn<LlmFetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );
    const provider = new AnthropicProvider({
      apiKey: fakeKey,
      config: testConfig,
      fetch,
    });
    const completion = provider.complete({
      ...request,
      role,
      ...(role === 'story' ? { timeoutMs: timeout } : {}),
    });
    const assertion =
      expect(completion).rejects.toBeInstanceOf(LlmUnavailableError);
    await vi.advanceTimersByTimeAsync(timeout - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  },
);

it('uses the SDK configured retry budget and backoff with a fake clock', async () => {
  vi.useFakeTimers();
  const transport = fakeTransport(
    Response.json({ error: { type: 'rate_limit_error' } }, { status: 429 }),
    Response.json({ error: { type: 'overloaded_error' } }, { status: 529 }),
    Response.json(wireMessage()),
  );
  const provider = new AnthropicProvider({
    apiKey: fakeKey,
    config: configSchema.parse({}),
    fetch: transport.fetch,
  });
  const completion = provider.complete(request);
  await vi.advanceTimersByTimeAsync(0);
  expect(transport.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(completion).resolves.toMatchObject({ stopReason: 'end_turn' });
  expect(transport.fetch).toHaveBeenCalledTimes(3);
});

it('rejects missing credentials without printing a value', () => {
  expect(() => new AnthropicProvider({ apiKey: '' })).toThrow(
    'ANTHROPIC_API_KEY is missing',
  );
});
