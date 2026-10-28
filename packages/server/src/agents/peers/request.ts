import { fileURLToPath } from 'node:url';
import { peerTurnSchema } from '@dungeon/shared';
import type {
  KnowledgeSlice,
  Fact,
  PeerTurn,
  PlayerIntent,
  ResolvedNarration,
} from '@dungeon/shared';
import { characterContext, knowledgeHash } from '../characterContext.js';
import { loadPrompt } from '../llm/prompts.js';
import type { LlmRequest } from '../llm/types.js';

export interface PeerInput {
  knowledge: KnowledgeSlice;
  player: Pick<PlayerIntent, 'selection' | 'text'>;
  lastNarration?: ResolvedNarration;
  consecutivePasses?: number;
  timeoutMs?: number;
  promptDirectory?: string;
  debugFacts?: readonly Fact[];
}

export async function buildPeerRequest(
  input: PeerInput,
): Promise<LlmRequest<PeerTurn>> {
  const prompt = await loadPrompt(
    'peer',
    input.promptDirectory ??
      fileURLToPath(new URL('../prompts/', import.meta.url)),
  );
  return {
    role: 'peer',
    outputFormat: peerTurnSchema,
    system: [{ text: prompt.text, cache: true }],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          character: characterContext(input.knowledge),
          lastCommittedNarration: input.lastNarration ?? null,
          playerIntent: input.player,
          ...(input.consecutivePasses !== undefined &&
          input.consecutivePasses >= 3
            ? {
                nudge:
                  'You have passed three consecutive turns. Consider one small step toward your private goal, if the situation permits.',
              }
            : {}),
        }),
      },
    ],
    promptVersion: `peer:${prompt.version}`,
    knowledgeSliceHash: knowledgeHash(input.knowledge),
    maxTokens: 1024,
    timeoutMs: input.timeoutMs ?? 20_000,
  };
}
