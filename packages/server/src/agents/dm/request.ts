import { fileURLToPath } from 'node:url';
import type { EpisodeSeed } from '@dungeon/shared';
import { loadPrompt } from '../llm/prompts.js';
import type { LlmRequest } from '../llm/types.js';
import { toolSchemasForProvider } from '../tools/jsonSchema.js';
import type { ToolRegistry } from '../tools/types.js';
import { renderEpisode, renderRecap } from './render.js';

export async function loadDmPrompts(
  directory = fileURLToPath(new URL('../prompts/', import.meta.url)),
) {
  const [principles, rules] = await Promise.all([
    loadPrompt('dm-principles', directory),
    loadPrompt('dm-rules', directory),
  ]);
  return {
    text: `${principles.text}\n\n${rules.text}`,
    version: `dm-principles:${principles.version},dm-rules:${rules.version}`,
  };
}

export function assembleDmRequest(options: {
  prompts: Awaited<ReturnType<typeof loadDmPrompts>>;
  seed: EpisodeSeed;
  recap?: string;
  dynamic: string;
  registry: ToolRegistry;
  timeoutMs: number;
  maxTokens?: number;
}): LlmRequest {
  const tools = toolSchemasForProvider(options.registry).map(
    (tool, index, all) =>
      index === all.length - 1
        ? { ...tool, cache: true, ttl: '1h' as const }
        : tool,
  );
  const recap = renderRecap(options.recap);
  return {
    role: 'dm',
    cacheTail: '5m',
    system: [
      { text: options.prompts.text, cache: true, ttl: '1h' },
      { text: renderEpisode(options.seed), cache: true, ttl: '1h' },
      ...(recap ? [{ text: recap, cache: false }] : []),
    ],
    tools,
    messages: [{ role: 'user', content: options.dynamic }],
    maxTokens: options.maxTokens ?? 4096,
    timeoutMs: options.timeoutMs,
    promptVersion: options.prompts.version,
  };
}
