import type { BeatContext } from './BeatContext.js';
import { toolRegistry } from './registry.js';
import { failure } from './types.js';
import type { Result, ToolRegistry } from './types.js';
import { ToolError } from './validation.js';

export async function executeToolCall(
  name: string,
  rawInput: unknown,
  ctx: BeatContext,
  registry: ToolRegistry = toolRegistry,
): Promise<Result<unknown>> {
  const tool = registry.find((candidate) => candidate.name === name);
  if (name !== 'narrate' && name !== 'voice_npc') ctx.counters.toolCalls++;
  if (tool?.kind === 'generator') ctx.counters.generatorCalls++;
  if (name === 'voice_npc') ctx.counters.voiceNpcCalls++;
  if (
    name !== 'narrate' &&
    name !== 'voice_npc' &&
    ctx.counters.toolCalls > ctx.limits.toolCalls
  )
    return failure(
      'TOOL_CAP_REACHED',
      `Tool call ${ctx.counters.toolCalls}: limit is ${ctx.limits.toolCalls}; call narrate.`,
    );
  if (
    tool?.kind === 'generator' &&
    ctx.counters.generatorCalls > ctx.limits.generatorCalls
  )
    return failure(
      'GENERATOR_CAP_REACHED',
      `Generator call ${ctx.counters.generatorCalls}: limit is ${ctx.limits.generatorCalls}.`,
    );
  if (
    name === 'voice_npc' &&
    ctx.counters.voiceNpcCalls > ctx.limits.voiceNpcPerBeat
  )
    return failure(
      'VOICE_NPC_CAP_REACHED',
      `voice_npc call ${ctx.counters.voiceNpcCalls}: limit is ${ctx.limits.voiceNpcPerBeat}.`,
    );
  if (!tool)
    return failure('UNKNOWN_TOOL', `${name}: expected a registered tool name.`);
  if (ctx.finished && name !== 'narrate')
    return failure(
      'BEAT_FINISHED',
      `${name}: narration already finished this tool loop.`,
    );
  try {
    const result = await tool.execute(rawInput, ctx);
    if (tool.kind === 'engine' || tool.kind === 'generator')
      ctx.collectEngineEvents();
    if (tool.kind !== 'engine' && result.ok) ctx.appendEvents(result.events);
    return result;
  } catch (error) {
    if (error instanceof ToolError) return failure(error.code, error.message);
    throw error;
  }
}
