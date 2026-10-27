import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type {
  Message,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages';
import { defaultConfig, type Config } from '@dungeon/shared';
import { calculateCostUsd } from './cost.js';
import {
  LlmError,
  LlmRefusalError,
  LlmRequestError,
  LlmUnavailableError,
  LlmValidationError,
} from './errors.js';
import { cacheWriteTtl, prepareRequest } from './request.js';
import { normalizeUsage } from './usage.js';
import type {
  LlmContentBlock,
  LlmFetch,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmRole,
  LlmUsage,
} from './types.js';

interface Options {
  apiKey: string;
  config?: Config;
  fetch?: LlmFetch;
  now?: () => number;
}

function standardMessages(messages: LlmMessage[]): MessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((block) => {
            if (block.type === 'fallback')
              throw new Error('Fallback history requires a DM or story role');
            return block;
          }),
  }));
}

function contentBlocks(message: Message | BetaMessage): LlmContentBlock[] {
  return message.content.map((block) => {
    switch (block.type) {
      case 'text':
      case 'thinking':
      case 'redacted_thinking':
      case 'tool_use':
      case 'fallback':
        return block;
      default:
        throw new Error('Unsupported response content block');
    }
  });
}

export class AnthropicProvider implements LlmProvider {
  readonly #client: Anthropic;
  readonly #config: Config;
  readonly #now: () => number;

  constructor(options: Options) {
    if (!options.apiKey.trim())
      throw new LlmRequestError(
        'dm',
        (options.config ?? defaultConfig).models.dm,
        'ANTHROPIC_API_KEY is missing',
      );
    this.#config = options.config ?? defaultConfig;
    this.#now = options.now ?? (() => performance.now());
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: this.#config.timeouts.providerRetries,
      timeout: this.#config.timeouts.othersMs,
      logLevel: 'off',
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    const model = this.#config.models[request.role];
    const started = this.#now();
    let message;
    try {
      message = await this.send(request);
    } catch (error) {
      throw this.mapError(error, request.role, model);
    }
    const stopReason = message.stop_reason;
    if (!stopReason)
      throw new LlmValidationError(request.role, model, 'missing stop reason');
    const latencyMs = this.#now() - started;
    const defaultTtl = cacheWriteTtl(request);
    let usage: LlmUsage;
    let costUsd: number;
    try {
      const iterations =
        'iterations' in message.usage ? message.usage.iterations : null;
      usage = {
        ...normalizeUsage(message.usage, defaultTtl),
        ...(iterations?.length
          ? {
              iterations: iterations.map((iteration) => ({
                ...normalizeUsage(iteration, defaultTtl),
                type: iteration.type,
                model: ('model' in iteration ? iteration.model : null) ?? model,
              })),
            }
          : {}),
      };
      costUsd = calculateCostUsd(usage, message.model, this.#config.prices);
    } catch {
      throw new LlmValidationError(
        request.role,
        model,
        'usage or serving-model prices are invalid',
      );
    }
    const response: LlmResponse<T> = {
      content: [],
      parsedOutput: null,
      stopReason,
      model: message.model,
      usage,
      costUsd,
      latencyMs,
      fallbackUsed:
        message.model !== model ||
        !!usage.iterations?.some(
          (iteration) => iteration.type === 'fallback_message',
        ),
    };
    if (stopReason === 'refusal') {
      response.content = contentBlocks(message);
      throw new LlmRefusalError(
        request.role,
        model,
        message.stop_details?.category ?? null,
        response,
      );
    }
    try {
      response.content = contentBlocks(message);
    } catch {
      throw new LlmValidationError(
        request.role,
        model,
        'unsupported response content',
        response,
      );
    }
    response.fallbackUsed ||= response.content.some(
      (block) => block.type === 'fallback',
    );
    if (request.outputFormat) {
      const parsed = 'parsed_output' in message ? message.parsed_output : null;
      if (stopReason !== 'end_turn' || parsed === null) {
        throw new LlmValidationError(
          request.role,
          model,
          'structured output is missing or incomplete',
          response,
        );
      }
      const result = request.outputFormat.safeParse(parsed);
      if (!result.success)
        throw new LlmValidationError(
          request.role,
          model,
          'structured output failed validation',
          response,
        );
      response.parsedOutput = result.data;
    }
    return response;
  }

  private async send<T>(request: LlmRequest<T>) {
    const model = this.#config.models[request.role];
    const timeout =
      request.timeoutMs ??
      (request.role === 'dm'
        ? this.#config.timeouts.dmMs
        : this.#config.timeouts.othersMs);
    const effort = this.#config.efforts[request.role];
    const base = {
      ...prepareRequest(request),
      model,
      max_tokens: request.maxTokens,
    };
    if (!this.#config.prices[model])
      throw new LlmRequestError(
        request.role,
        model,
        'model price is missing from config',
      );
    const format = request.outputFormat
      ? zodOutputFormat(request.outputFormat)
      : undefined;
    // The SDK parses refusal prose before returning stop_reason. Defer parse failures
    // so a refusal stays a refusal, and parser diagnostics cannot leak response text.
    const safeFormat = format
      ? {
          ...format,
          parse: (text: string) => {
            try {
              return format.parse(text);
            } catch {
              return null;
            }
          },
        }
      : undefined;
    if (request.role === 'dm' || request.role === 'story') {
      const params = {
        ...base,
        messages: request.messages,
        fallbacks: 'default' as const,
        betas: ['server-side-fallback-2026-07-01'],
        output_config: {
          effort,
          ...(safeFormat ? { format: safeFormat } : {}),
        },
      };
      return safeFormat
        ? this.#client.beta.messages.parse(params, { timeout })
        : this.#client.beta.messages.create(params, { timeout });
    }
    const params = {
      ...base,
      messages: standardMessages(request.messages),
      output_config: { effort, ...(safeFormat ? { format: safeFormat } : {}) },
    };
    return safeFormat
      ? this.#client.messages.parse(params, { timeout })
      : this.#client.messages.create(params, { timeout });
  }

  private mapError(error: unknown, role: LlmRole, model: string): LlmError {
    if (error instanceof LlmError) return error;
    if (error instanceof Anthropic.NotFoundError)
      return new LlmRequestError(
        role,
        model,
        'model or endpoint not found (404)',
      );
    if (error instanceof Anthropic.AuthenticationError)
      return new LlmRequestError(role, model, 'authentication failed (401)');
    if (error instanceof Anthropic.BadRequestError)
      return new LlmRequestError(role, model, 'invalid request (400)');
    if (error instanceof Anthropic.RateLimitError)
      return new LlmUnavailableError(role, model, 'rate limit exhausted (429)');
    if (error instanceof Anthropic.InternalServerError)
      return new LlmUnavailableError(
        role,
        model,
        `provider unavailable (${error.status})`,
      );
    if (error instanceof Anthropic.APIConnectionError)
      return new LlmUnavailableError(
        role,
        model,
        'connection or timeout retries exhausted',
      );
    if (error instanceof Anthropic.APIError) {
      return error.status === 408 || error.status === 409
        ? new LlmUnavailableError(
            role,
            model,
            `provider retries exhausted (${error.status})`,
          )
        : new LlmRequestError(
            role,
            model,
            `API request failed (${error.status ?? 'unknown'})`,
          );
    }
    return new LlmRequestError(
      role,
      model,
      'invalid provider request or configuration',
    );
  }
}
