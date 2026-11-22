import type { ModelPrice } from '@dungeon/shared';
import type { LlmUsage, TokenUsage } from './types.js';

export function tokenCostUsd(usage: TokenUsage, price: ModelPrice): number {
  const promptTokens =
    usage.inputTokens +
    usage.cacheCreationInputTokens +
    usage.cacheReadInputTokens;
  const rates =
    price.longContext && promptTokens > price.longContext.aboveInputTokens
      ? price.longContext
      : price;
  return (
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadInputTokens * rates.cacheRead +
      usage.cacheCreation.ephemeral5mInputTokens * rates.cacheWrite5m +
      usage.cacheCreation.ephemeral1hInputTokens * rates.cacheWrite1h) /
    1_000_000
  );
}

export function calculateCostUsd(
  usage: LlmUsage,
  model: string,
  prices: Record<string, ModelPrice>,
): number {
  const cost = (tokens: TokenUsage, servedModel: string) => {
    const price = prices[servedModel];
    if (!price) throw new Error(`Missing LLM prices for model ${servedModel}`);
    return tokenCostUsd(tokens, price);
  };
  // Iterations already include the aggregate usage; billing both would double count.
  return usage.iterations?.length
    ? usage.iterations.reduce(
        (total, iteration) => total + cost(iteration, iteration.model),
        0,
      )
    : cost(usage, model);
}
