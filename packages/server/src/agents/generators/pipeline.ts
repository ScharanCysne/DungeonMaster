import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { EntityId, SpriteManifest } from '@dungeon/shared';
import {
  LlmRefusalError,
  LlmRequestError,
  LlmValidationError,
} from '../llm/errors.js';
import { loadPrompt } from '../llm/prompts.js';
import type { LlmProvider } from '../llm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { failure, success } from '../tools/types.js';
import type { Result } from '../tools/types.js';
import { generationContext } from './context.js';
import { Registrar } from './registration.js';
import type { Registration } from './registration.js';
import { GenerationProblems } from './validation.js';

export interface GeneratorOptions {
  provider: LlmProvider;
  sprites: SpriteManifest;
  promptDirectory?: string;
}
export type GeneratorKind = 'item' | 'npc' | 'feature' | 'story';

export async function generate<R, T>(
  options: GeneratorOptions,
  kind: GeneratorKind,
  schema: z.ZodType<R>,
  input: unknown,
  references: readonly EntityId[],
  ctx: BeatContext,
  prepare: (raw: R, registrar: Registrar) => Registration<T>,
): Promise<Result<T>> {
  const context = await generationContext(ctx, references);
  const prompt = await loadPrompt(
    `generator-${kind}`,
    options.promptDirectory ??
      fileURLToPath(new URL('../prompts/', import.meta.url)),
  );
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await options.provider.complete({
        role: kind === 'story' ? 'story' : 'generator',
        outputFormat: schema,
        system: [{ text: prompt.text, cache: true }],
        messages: [
          {
            role: 'user',
            content: [
              `Request: ${JSON.stringify(input)}`,
              `Policy: ${JSON.stringify({ limits: ctx.limits, npcStats: ctx.config.generatorStats })}`,
              `Graph context: ${context.excerpt}`,
              ...(problems.length
                ? [
                    `Previous output failed validation. Correct all problems:\n- ${problems.join('\n- ')}`,
                  ]
                : []),
              `Sprite catalogue tags: ${Object.keys(options.sprites.tags).join(',')}`,
            ].join('\n\n'),
          },
        ],
        promptVersion: `generator-${kind}:${prompt.version}`,
        maxTokens: 4096,
        timeoutMs: ctx.config.timeouts.othersMs,
      });
      const raw = schema.parse(response.parsedOutput);
      const plan = prepare(raw, new Registrar(ctx, context, options.sprites));
      const created = ctx.engine.createEntities(plan.creations);
      if (!created.ok) throw new GenerationProblems([created.error.message]);
      if (plan.story) ctx.storyFacts.push(structuredClone(plan.story));
      return success(plan.resolve(created.value), plan.events, plan.describe);
    } catch (error) {
      if (error instanceof LlmRefusalError || error instanceof LlmRequestError)
        return failure('GENERATION_FAILED', error.message);
      if (error instanceof GenerationProblems) problems = error.problems;
      else if (error instanceof z.ZodError)
        problems = error.issues.map(
          (issue) => `${issue.path.join('.') || 'output'}: ${issue.message}`,
        );
      else if (error instanceof LlmValidationError) problems = [error.message];
      else throw error;
    }
  }
  return failure('GENERATION_FAILED', problems.join('; '));
}
