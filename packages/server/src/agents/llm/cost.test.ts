import { defaultConfig } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { calculateCostUsd } from './cost.js';
import type { LlmUsage } from './types.js';

function usage(overrides: Partial<LlmUsage> = {}): LlmUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation: { ephemeral5mInputTokens: 0, ephemeral1hInputTokens: 0 },
    ...overrides,
  };
}
it.each([
  ['claude-opus-5-5', 4, 20, 0.2, 5, 8],
  ['claude-sonnet-5-5', 2, 10, 0.2, 2.5, 4],
] as const)(
  'prices every token category for %s',
  (model, input, output, read, five, hour) => {
    expect(
      calculateCostUsd(
        usage({ inputTokens: 1_000_000 }),
        model,
        defaultConfig.prices,
      ),
    ).toBe(input);
    expect(
      calculateCostUsd(
        usage({ outputTokens: 1_000_000 }),
        model,
        defaultConfig.prices,
      ),
    ).toBe(output);
    expect(
      calculateCostUsd(
        usage({ cacheReadInputTokens: 1_000_000 }),
        model,
        defaultConfig.prices,
      ),
    ).toBe(read);
    expect(
      calculateCostUsd(
        usage({
          cacheCreationInputTokens: 1_000_000,
          cacheCreation: {
            ephemeral5mInputTokens: 1_000_000,
            ephemeral1hInputTokens: 0,
          },
        }),
        model,
        defaultConfig.prices,
      ),
    ).toBe(five);
    expect(
      calculateCostUsd(
        usage({
          cacheCreationInputTokens: 1_000_000,
          cacheCreation: {
            ephemeral5mInputTokens: 0,
            ephemeral1hInputTokens: 1_000_000,
          },
        }),
        model,
        defaultConfig.prices,
      ),
    ).toBe(hour);
  },
);
it.each([100_000, 100_001])(
  'prices Haiku at the %s prompt-token boundary including cached tokens',
  (total) => {
    const long = total > 100_000;
    const tokens = usage({
      inputTokens: total - 90_000,
      outputTokens: 200,
      cacheReadInputTokens: 60_000,
      cacheCreationInputTokens: 30_000,
      cacheCreation: {
        ephemeral5mInputTokens: 10_000,
        ephemeral1hInputTokens: 20_000,
      },
    });
    const expected =
      ((total - 90_000) * (long ? 0.5 : 0.1) +
        200 * (long ? 2.5 : 0.5) +
        60_000 * 0.01 +
        10_000 * (long ? 0.625 : 0.125) +
        20_000 * (long ? 1 : 0.2)) /
      1_000_000;
    expect(
      calculateCostUsd(tokens, 'claude-haiku-5-5', defaultConfig.prices),
    ).toBeCloseTo(expected, 10);
  },
);
it('does not count output tokens toward the Haiku long-prompt threshold', () => {
  expect(
    calculateCostUsd(
      usage({ outputTokens: 1_000_000 }),
      'claude-haiku-5-5',
      defaultConfig.prices,
    ),
  ).toBe(0.5);
});
it('fails explicitly for unknown prices instead of reporting a free call', () => {
  expect(() =>
    calculateCostUsd(usage(), 'unknown', defaultConfig.prices),
  ).toThrow('Missing LLM prices for model unknown');
});
