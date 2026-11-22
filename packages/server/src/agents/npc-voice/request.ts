import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { KnowledgeSlice } from '@dungeon/shared';
import { characterContext, knowledgeHash } from '../characterContext.js';
import { loadPrompt } from '../llm/prompts.js';
import type { LlmRequest } from '../llm/types.js';

export const npcLineSchema = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1)
    .refine(
      (text) => !/[\r\n]/u.test(text) && text.split(/\s+/u).length <= 60,
      { message: 'Dialogue must be one line of at most 60 words.' },
    ),
});

export async function buildNpcVoiceRequest(input: {
  knowledge: KnowledgeSlice;
  direction: string;
  timeoutMs?: number;
  promptDirectory?: string;
}): Promise<LlmRequest<z.infer<typeof npcLineSchema>>> {
  const prompt = await loadPrompt(
    'npc-voice',
    input.promptDirectory ??
      fileURLToPath(new URL('../prompts/', import.meta.url)),
  );
  return {
    role: 'npc_voice',
    outputFormat: npcLineSchema,
    system: [{ text: prompt.text, cache: true }],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          character: characterContext(input.knowledge),
          direction: input.direction,
        }),
      },
    ],
    promptVersion: `npc-voice:${prompt.version}`,
    knowledgeSliceHash: knowledgeHash(input.knowledge),
    maxTokens: 512,
    timeoutMs: input.timeoutMs ?? 20_000,
  };
}
