import type {
  toolSchemas,
  ToolResult,
  VoiceNpcInput,
  VoiceNpcOutput,
} from '@dungeon/shared';
import type { z } from 'zod';
import type { LogDraft } from '../../ontology/eventLog.js';
import type { BeatContext } from './BeatContext.js';

export type ToolName = keyof typeof toolSchemas;
export type ToolKind = 'engine' | 'soft' | 'generator' | 'terminal';
export type ToolInput<N extends ToolName> = z.infer<
  (typeof toolSchemas)[N]['input']
>;
export type ToolOutput<N extends ToolName> = z.infer<
  (typeof toolSchemas)[N]['output']
>;
export type Result<T> = ToolResult<T, LogDraft>;

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: ToolName;
  kind: ToolKind;
  description: string;
  input: I;
  output: O;
  handler(input: z.infer<I>, ctx: BeatContext): Promise<Result<z.infer<O>>>;
}

export interface RegisteredTool {
  name: ToolName;
  kind: ToolKind;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  execute(rawInput: unknown, ctx: BeatContext): Promise<Result<unknown>>;
}
export type ToolRegistry = readonly RegisteredTool[];

export type GeneratorName =
  'generate_item' | 'generate_npc' | 'generate_feature' | 'generate_story';
export type Generators = {
  [N in GeneratorName]: (
    input: ToolInput<N>,
    ctx: BeatContext,
  ) => Promise<Result<ToolOutput<N>>>;
};
export interface NpcVoice {
  voice(
    input: VoiceNpcInput,
    ctx: BeatContext,
  ): Promise<Result<VoiceNpcOutput>>;
}

export function failure(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
export function success<T>(
  value: T,
  events: LogDraft[],
  facts: string[],
): Result<T> {
  return { ok: true, value, events, facts };
}
