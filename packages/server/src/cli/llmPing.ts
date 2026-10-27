import { resolve } from 'node:path';
import { z } from 'zod';
import { AnthropicProvider, loadPrompt } from '../agents/llm/index.js';
import type { LlmRequest, LlmResponse } from '../agents/llm/types.js';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});
const promptDir = resolve('packages/server/src/agents/prompts');
let total = 0;

function report(label: string, result: LlmResponse): void {
  const usage = result.usage;
  total += result.costUsd;
  console.log(
    `${label}: model=${result.model} stop=${result.stopReason} input=${usage.inputTokens} output=${usage.outputTokens} cache_read=${usage.cacheReadInputTokens} cache_write_5m=${usage.cacheCreation.ephemeral5mInputTokens} cache_write_1h=${usage.cacheCreation.ephemeral1hInputTokens} latency=${result.latencyMs.toFixed(0)}ms cost=$${result.costUsd.toFixed(6)}`,
  );
}

for (const role of ['dm', 'story', 'peer'] as const) {
  const prompt = await loadPrompt(role, promptDir);
  const request: LlmRequest = {
    role,
    system: [{ text: prompt.text, cache: true }],
    promptVersion: prompt.version,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
    maxTokens: 64,
  };
  report(role === 'peer' ? 'fast' : role, await provider.complete(request));
}
const prompt = await loadPrompt('peer', promptDir);
report(
  'structured',
  await provider.complete({
    role: 'peer',
    system: [{ text: prompt.text, cache: true }],
    promptVersion: prompt.version,
    messages: [{ role: 'user', content: 'Return ok=true.' }],
    maxTokens: 64,
    outputFormat: z.strictObject({ ok: z.boolean() }),
  }),
);
console.log(`Total: $${total.toFixed(6)}`);
