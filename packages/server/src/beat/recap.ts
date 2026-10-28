import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { GameEvent } from '@dungeon/shared';
import { loadPrompt } from '../agents/llm/prompts.js';
import { LlmValidationError } from '../agents/llm/errors.js';
import type { LlmProvider } from '../agents/llm/types.js';

const recapSchema = z.strictObject({ text: z.string().trim().min(1) });
export async function generateRecap(
  provider: LlmProvider,
  records: readonly GameEvent[],
  timeoutMs: number,
) {
  const prompt = await loadPrompt(
    'recap',
    fileURLToPath(new URL('../agents/prompts/', import.meta.url)),
  );
  const response = await provider.complete({
    role: 'recap',
    system: [{ text: prompt.text, cache: true }],
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          records.filter(
            ({ type }) =>
              ![
                'SeedLoaded',
                'RecapUpdated',
                'BeatStarted',
                'BeatCommitted',
              ].includes(type),
          ),
        ),
      },
    ],
    outputFormat: recapSchema,
    promptVersion: `recap:${prompt.version}`,
    maxTokens: 1024,
    timeoutMs,
  });
  if (response.stopReason !== 'end_turn')
    throw new LlmValidationError(
      'recap',
      response.model,
      'Incomplete recap.',
      response,
    );
  return recapSchema.parse(response.parsedOutput).text;
}
