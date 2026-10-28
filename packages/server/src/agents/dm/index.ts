import type { EpisodeSeed } from '@dungeon/shared';
import type { LlmProvider } from '../llm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { toolRegistry } from '../tools/registry.js';
import type { ToolRegistry } from '../tools/types.js';
import { playerId } from '../tools/validation.js';
import { renderDynamicContext } from './budget.js';
import { loadDmContext } from './context.js';
import { DmBeat } from './DmBeat.js';
import { assembleDmRequest, loadDmPrompts } from './request.js';
import type { DmIntents } from './types.js';

export async function createDmBeat(options: {
  provider: LlmProvider;
  ctx: BeatContext;
  seed: EpisodeSeed;
  intents: DmIntents;
  recap?: string;
  recentEvents?: number;
  promptDirectory?: string;
  maxTokens?: number;
  registry?: ToolRegistry;
}): Promise<DmBeat> {
  const registry = options.registry ?? toolRegistry;
  const [data, prompts] = await Promise.all([
    loadDmContext(
      options.ctx,
      playerId(options.ctx),
      options.intents,
      options.recentEvents,
    ),
    loadDmPrompts(options.promptDirectory),
  ]);
  const { text, droppedContext } = renderDynamicContext(
    data,
    options.ctx.config.input.contextBudgetTokens,
  );
  return new DmBeat({
    ...options,
    registry,
    request: assembleDmRequest({
      ...options,
      prompts,
      registry,
      dynamic: text,
      timeoutMs: options.ctx.config.timeouts.dmMs,
    }),
    droppedContext,
  });
}

export { DmBeat, NARRATE_NOW } from './DmBeat.js';
export { loadDmContext } from './context.js';
export { renderDynamicContext, estimateTokens } from './budget.js';
export { assembleDmRequest, loadDmPrompts } from './request.js';
export * from './types.js';
