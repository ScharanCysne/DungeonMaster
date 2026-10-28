import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { PauseReason } from '@dungeon/shared';
import { loadPrompt } from '../agents/llm/prompts.js';
import {
  LlmUnavailableError,
  LlmValidationError,
} from '../agents/llm/errors.js';
import type { LlmProvider } from '../agents/llm/types.js';
import type { BeatRunnerOptions } from './types.js';
import { Deadline } from './Deadline.js';

const healthySchema = z.strictObject({ ready: z.literal(true) });
export async function checkHealth(
  reason: PauseReason,
  options: BeatRunnerOptions,
  provider: LlmProvider,
): Promise<boolean> {
  const deadline = new Deadline(
    options.clock,
    options.config.timeouts.othersMs,
  );
  try {
    if (reason === 'graph_unavailable') {
      await deadline.wait(options.store.nodes());
      return true;
    }
    if (reason !== 'llm_unavailable') return true;
    const prompt = await loadPrompt(
      'ping',
      fileURLToPath(new URL('../agents/prompts/', import.meta.url)),
    );
    const result = await deadline.wait(
      provider.complete({
        role: 'peer',
        system: [{ text: prompt.text, cache: false }],
        messages: [{ role: 'user', content: 'Return {"ready":true}.' }],
        outputFormat: healthySchema,
        maxTokens: 64,
        timeoutMs: options.config.timeouts.othersMs,
        promptVersion: `health/ping:${prompt.version}`,
      }),
    );
    return (
      result.stopReason === 'end_turn' &&
      healthySchema.safeParse(result.parsedOutput).success
    );
  } catch (error) {
    if (
      error instanceof LlmUnavailableError ||
      error instanceof LlmValidationError
    )
      return false;
    throw error;
  } finally {
    deadline.stop();
  }
}
