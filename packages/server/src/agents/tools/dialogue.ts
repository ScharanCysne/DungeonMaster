import { voiceNpcOutputSchema, resolvedNarrationSchema } from '@dungeon/shared';
import type {
  NarrateInput,
  ResolvedDialogueLine,
  VoiceNpcInput,
} from '@dungeon/shared';
import type { BeatContext } from './BeatContext.js';
import { failure, success } from './types.js';
import {
  playerId,
  requireCharacter,
  requirePresent,
  requireTool,
} from './validation.js';

export async function voiceNpc(input: VoiceNpcInput, ctx: BeatContext) {
  const npc = await requireCharacter(await ctx.softState(), input.npc);
  requireTool(
    npc.role === 'npc',
    'NOT_AN_NPC',
    `${input.npc}: expected role npc.`,
  );
  requirePresent(ctx, input.npc, playerId(ctx));
  requireTool(
    ctx.engine.state.characters.get(input.npc)?.conscious,
    'NPC_UNCONSCIOUS',
    `${input.npc}: expected a conscious NPC.`,
  );
  const result = await ctx.npcVoice.voice(input, ctx);
  if (!result.ok) return result;
  const parsed = voiceNpcOutputSchema.safeParse(result.value);
  if (!parsed.success)
    return failure('INVALID_VOICE_OUTPUT', parsed.error.message);
  requireTool(
    !ctx.voicedLines.has(parsed.data.lineId),
    'DUPLICATE_LINE_ID',
    `${parsed.data.lineId}: expected a new voice line ID this beat.`,
  );
  ctx.voicedLines.set(parsed.data.lineId, {
    speaker: input.npc,
    text: parsed.data.text,
  });
  return success(parsed.data, [], result.facts);
}

export async function narrate(input: NarrateInput, ctx: BeatContext) {
  const view = await ctx.softState();
  const lines: ResolvedDialogueLine[] = [];
  for (const line of input.lines) {
    if ('lineId' in line) {
      const voiced = ctx.voicedLines.get(line.lineId);
      requireTool(
        voiced,
        'NPC_LINE_NOT_VOICED',
        `${line.lineId}: expected a voice_npc line from this beat.`,
      );
      lines.push({ ...voiced, lineId: line.lineId });
    } else {
      const speaker = await requireCharacter(view, line.speaker);
      requireTool(
        speaker.role === 'peer',
        'NOT_A_PEER',
        `${line.speaker}: direct dialogue requires a peer; NPCs require a voiced lineId.`,
      );
      requireTool(
        ctx.peerSayLines.some(
          (said) => said.speaker === line.speaker && said.text === line.text,
        ),
        'PEER_LINE_NOT_SAID',
        `${line.speaker}: expected an exact peer say line available this beat.`,
      );
      lines.push({ ...line });
    }
  }
  ctx.narration = resolvedNarrationSchema.parse({ ...input, lines });
  ctx.finished = true;
  return success(input, [], ['Narration recorded; the tool loop is finished.']);
}
