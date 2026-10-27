import { expect, it } from 'vitest';
import { providerFor, request, wireMessage, wireUsage } from './testing.js';

it('uses an explicitly overridden TTL when the API omits its optional breakdown', async () => {
  const { provider } = providerFor(
    wireMessage({
      model: 'claude-opus-5-5',
      usage: { ...wireUsage, cache_creation: null },
    }),
  );
  const response = await provider.complete({
    ...request,
    role: 'dm',
    system: [{ text: 'prefix', cache: true, ttl: '5m' }],
  });
  expect(response.usage.cacheCreation).toEqual({
    ephemeral5mInputTokens: 30,
    ephemeral1hInputTokens: 0,
  });
  expect(response.costUsd).toBeCloseTo((40 + 100 + 8 + 150) / 1_000_000);
});
it('rejects ambiguous missing cache usage for mixed TTL requests', async () => {
  const { provider } = providerFor(
    wireMessage({ usage: { ...wireUsage, cache_creation: null } }),
  );
  await expect(
    provider.complete({
      ...request,
      system: [
        { text: 'long', cache: true, ttl: '1h' },
        { text: 'short', cache: true, ttl: '5m' },
      ],
    }),
  ).rejects.toThrow('usage or serving-model prices are invalid');
});
it('normalizes nullable cache fields on an uncached response', async () => {
  const { provider } = providerFor(
    wireMessage({
      usage: {
        ...wireUsage,
        cache_creation: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    }),
  );
  expect((await provider.complete(request)).usage).toMatchObject({
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreation: { ephemeral5mInputTokens: 0, ephemeral1hInputTokens: 0 },
  });
});
