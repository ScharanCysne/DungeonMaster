import { defaultConfig } from '@dungeon/shared';
import { LlmRefusalError, LlmValidationError } from './errors.js';
import type {
  LlmContentBlock,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmRole,
} from './types.js';

export type ScriptedReply =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; content: LlmContentBlock[] }
  | { type: 'structured'; output: unknown }
  | { type: 'refusal'; category?: string }
  | { type: 'error'; error: Error }
  | { type: 'response'; response: LlmResponse };

export class ScriptedProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private readonly queues = new Map<LlmRole, ScriptedReply[]>();
  constructor(script: Partial<Record<LlmRole, readonly ScriptedReply[]>> = {}) {
    for (const role of Object.keys(defaultConfig.models)) {
      if (role in defaultConfig.models) {
        const key = roleSchema(role);
        this.queues.set(key, [...(script[key] ?? [])]);
      }
    }
  }
  enqueue(role: LlmRole, ...replies: ScriptedReply[]): void {
    const queue = this.queues.get(role) ?? [];
    queue.push(...replies);
    this.queues.set(role, queue);
  }
  assertDrained(): void {
    for (const [role, queue] of this.queues)
      if (queue.length)
        throw new Error(
          `Unused scripted LLM calls for ${role}: ${queue.length}`,
        );
  }
  complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    return Promise.resolve().then(() => this.replay(request));
  }
  private replay<T>(request: LlmRequest<T>): LlmResponse<T> {
    this.requests.push(request);
    const reply = this.queues.get(request.role)?.shift();
    if (!reply) throw new Error(`Unexpected LLM call for ${request.role}`);
    const model = defaultConfig.models[request.role];
    if (reply.type === 'error') throw reply.error;
    if (reply.type === 'refusal')
      throw new LlmRefusalError(request.role, model, reply.category);
    const response: LlmResponse<T> = {
      content: [],
      parsedOutput: null,
      stopReason: 'end_turn',
      model,
      costUsd: 0,
      latencyMs: 0,
      fallbackUsed: false,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheCreation: { ephemeral5mInputTokens: 0, ephemeral1hInputTokens: 0 },
      },
    };
    if (reply.type === 'text')
      response.content = [{ type: 'text', text: reply.text }];
    if (reply.type === 'tool_use') {
      response.content = reply.content;
      response.stopReason = 'tool_use';
    }
    if (reply.type === 'response')
      Object.assign(response, { ...reply.response, parsedOutput: null });
    if (response.stopReason === 'refusal')
      throw new LlmRefusalError(request.role, model, null, response);
    if (request.outputFormat) {
      const output =
        reply.type === 'structured'
          ? reply.output
          : reply.type === 'response'
            ? reply.response.parsedOutput
            : null;
      const parsed = request.outputFormat.safeParse(output);
      if (
        output === null ||
        !parsed.success ||
        response.stopReason !== 'end_turn'
      )
        throw new LlmValidationError(
          request.role,
          model,
          'scripted output failed validation',
          response,
        );
      response.parsedOutput = parsed.data;
    } else if (reply.type === 'structured')
      throw new Error('Scripted structured reply requires outputFormat');
    return response;
  }
}

function roleSchema(role: string): LlmRole {
  switch (role) {
    case 'dm':
    case 'story':
    case 'peer':
    case 'npc_voice':
    case 'generator':
    case 'critic':
    case 'recap':
      return role;
    default:
      throw new Error(`Unknown LLM role: ${role}`);
  }
}
