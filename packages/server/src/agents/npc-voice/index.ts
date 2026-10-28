import { knowledgeSlice } from '../../ontology/queries/knowledge.js';
import { LlmUnavailableError } from '../llm/errors.js';
import type { LlmProvider } from '../llm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { failure, success } from '../tools/types.js';
import type { NpcVoice } from '../tools/types.js';
import { buildNpcVoiceRequest, npcLineSchema } from './request.js';

const sequences = new WeakMap<BeatContext, number>();

export function createNpcVoice(options: {
  provider: LlmProvider;
  promptDirectory?: string;
}): NpcVoice {
  return {
    async voice(input, ctx) {
      const knowledge = await knowledgeSlice(await ctx.softState(), input.npc);
      const request = await buildNpcVoiceRequest({
        ...options,
        knowledge,
        direction: input.direction,
        timeoutMs: ctx.config.timeouts.othersMs,
      });
      try {
        const response = await options.provider.complete(request);
        if (response.stopReason !== 'end_turn')
          throw new Error(`NPC voice stopped with ${response.stopReason}.`);
        const { text } = npcLineSchema.parse(response.parsedOutput);
        let sequence = sequences.get(ctx) ?? 0;
        let lineId: string;
        do {
          lineId = `voice-${ctx.beat}-${++sequence}`;
        } while (ctx.voicedLines.has(lineId));
        sequences.set(ctx, sequence);
        return success({ lineId, text }, [], []);
      } catch (error) {
        if (error instanceof LlmUnavailableError) throw error;
        return failure(
          'NPC_VOICE_FAILED',
          error instanceof Error ? error.message : 'NPC voice failed.',
        );
      }
    },
  };
}

export { buildNpcVoiceRequest, npcLineSchema } from './request.js';
