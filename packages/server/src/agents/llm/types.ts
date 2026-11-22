import type { Config, ModelMap } from '@dungeon/shared';
import type { z } from 'zod';

export type LlmRole = keyof ModelMap;
export type LlmEffort = Config['efforts'][LlmRole];
export type CacheTtl = '5m' | '1h';
export interface SystemBlock {
  text: string;
  cache: boolean;
  ttl?: CacheTtl;
}
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  apiInputSchema?: z.core.JSONSchema.JSONSchema & { type: 'object' };
  // Defaults to true; the API accepts at most 20 strict tools per request.
  strict?: boolean;
  cache?: boolean;
  ttl?: CacheTtl;
}
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | ToolUseBlock
  | {
      type: 'fallback';
      from: { model: string };
      to: { model: string };
      trigger?: unknown;
    };
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | (LlmContentBlock | ToolResultBlock)[];
}
export type LlmRequest<T = unknown> = {
  system: SystemBlock[];
  messages: LlmMessage[];
  // Automatic breakpoint on the conversation tail, using one of four slots.
  cacheTail?: '5m';
  maxTokens: number;
  timeoutMs?: number;
  promptVersion?: string;
  knowledgeSliceHash?: string;
} & (
  | { role: 'dm'; tools?: ToolSchema[]; outputFormat?: never }
  | { role: Exclude<LlmRole, 'dm'>; tools?: never; outputFormat?: z.ZodType<T> }
);
export type LlmStopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'refusal'
  | 'pause_turn'
  | 'stop_sequence'
  | 'model_context_window_exceeded'
  | 'compaction';
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheCreation: {
    ephemeral5mInputTokens: number;
    ephemeral1hInputTokens: number;
  };
}
export interface LlmUsage extends TokenUsage {
  iterations?: (TokenUsage & { type: string; model: string })[];
}
export interface LlmResponse<T = unknown> {
  content: LlmContentBlock[];
  parsedOutput: T | null;
  stopReason: LlmStopReason;
  model: string;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
  fallbackUsed: boolean;
}
export interface LlmProvider {
  complete<T = unknown>(request: LlmRequest<T>): Promise<LlmResponse<T>>;
}
export type LlmFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
