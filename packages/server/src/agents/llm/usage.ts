import type { CacheTtl, TokenUsage } from './types.js';

interface WireUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  } | null;
}

export function normalizeUsage(
  usage: WireUsage,
  defaultTtl: CacheTtl | undefined,
): TokenUsage {
  const total = usage.cache_creation_input_tokens ?? 0;
  if (total > 0 && !usage.cache_creation && !defaultTtl) {
    throw new Error('Mixed cache TTLs require a usage breakdown');
  }
  const fiveMinute =
    usage.cache_creation?.ephemeral_5m_input_tokens ??
    (defaultTtl === '5m' ? total : 0);
  const oneHour =
    usage.cache_creation?.ephemeral_1h_input_tokens ??
    (defaultTtl === '1h' ? total : 0);
  if (fiveMinute + oneHour !== total)
    throw new Error('Inconsistent cache creation usage');
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: total,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreation: {
      ephemeral5mInputTokens: fiveMinute,
      ephemeral1hInputTokens: oneHour,
    },
  };
}
