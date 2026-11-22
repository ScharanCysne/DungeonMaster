import type { LlmResponse, TokenUsage } from '../llm/types.js';
import type { DmIterationUsage } from './types.js';

export class DmMetrics {
  iterations = 0;
  iterationUsage: DmIterationUsage[] = [];
  costUsd = 0;
  latencyMs = 0;
  fallbackUsed = false;
  usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreation: { ephemeral5mInputTokens: 0, ephemeral1hInputTokens: 0 },
  };

  add(response?: LlmResponse): void {
    this.iterationUsage.push({
      iteration: this.iterations,
      usage: response ? structuredClone(response.usage) : null,
    });
    if (!response) return;
    this.costUsd += response.costUsd;
    this.latencyMs += response.latencyMs;
    this.fallbackUsed ||= response.fallbackUsed;
    for (const key of [
      'inputTokens',
      'outputTokens',
      'cacheCreationInputTokens',
      'cacheReadInputTokens',
    ] as const)
      this.usage[key] += response.usage[key];
    for (const key of [
      'ephemeral5mInputTokens',
      'ephemeral1hInputTokens',
    ] as const)
      this.usage.cacheCreation[key] += response.usage.cacheCreation[key];
  }
}
