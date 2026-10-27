import { defaultConfig, type Config } from '@dungeon/shared';
import { LlmError, LlmRefusalError } from './errors.js';
import {
  promptHash,
  redactText,
  serializeRequest,
  traceValue,
} from './traceSerialization.js';
import type { TraceSink } from './traces.js';
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';

interface Options {
  config?: Config;
  secrets?: readonly string[];
  now?: () => number;
}
export class TracingProvider implements LlmProvider {
  private readonly config: Config;
  private readonly secrets: readonly string[];
  private readonly now: () => number;
  constructor(
    private readonly provider: LlmProvider,
    private readonly sinks: readonly TraceSink[],
    options: Options = {},
  ) {
    this.config = options.config ?? defaultConfig;
    this.secrets = [
      ...(options.secrets ?? []),
      process.env.ANTHROPIC_API_KEY ?? '',
    ];
    this.now = options.now ?? (() => performance.now());
  }
  async complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    const start = this.now();
    const modelRequested = this.config.models[request.role];
    const effort = this.config.efforts[request.role];
    const cacheRequested = [...(request.tools ?? []), ...request.system].some(
      (block) => block.cache,
    );
    const snapshot = serializeRequest(
      {
        ...request,
        timeoutMs:
          request.timeoutMs ??
          (request.role === 'dm'
            ? this.config.timeouts.dmMs
            : this.config.timeouts.othersMs),
      },
      this.secrets,
    );
    let response: LlmResponse | undefined;
    let error: unknown;
    try {
      const result = await this.provider.complete(request);
      response = result;
      return result;
    } catch (caught) {
      error = caught;
      if (caught instanceof LlmError) response = caught.response;
      throw caught;
    } finally {
      const trace = {
        role: request.role,
        modelRequested: redactText(modelRequested, this.secrets),
        modelServed: response ? redactText(response.model, this.secrets) : null,
        effort,
        promptHash: promptHash(
          traceValue(
            { modelRequested, effort, request: snapshot },
            this.secrets,
          ),
        ),
        knowledgeSliceHash: request.knowledgeSliceHash
          ? redactText(request.knowledgeSliceHash, this.secrets)
          : null,
        promptVersion: redactText(
          request.promptVersion ?? 'unversioned',
          this.secrets,
        ),
        usage: traceValue(response?.usage, this.secrets),
        costUsd: response?.costUsd ?? 0,
        latencyMs: this.now() - start,
        stopReason: response?.stopReason ?? null,
        fallbackUsed: response?.fallbackUsed ?? false,
        cacheMiss:
          request.role === 'dm' &&
          cacheRequested &&
          !!response &&
          response.usage.cacheReadInputTokens === 0,
        promptBelowCacheMinimum:
          cacheRequested &&
          !!response &&
          response.usage.inputTokens +
            response.usage.cacheCreationInputTokens +
            response.usage.cacheReadInputTokens <
            512,
        request: snapshot,
        response: traceValue(response, this.secrets),
        error: error
          ? traceValue(
              {
                name: error instanceof Error ? error.name : 'Error',
                ...(error instanceof LlmRefusalError
                  ? { category: error.category }
                  : {}),
                message:
                  error instanceof LlmError
                    ? error.message
                    : 'Provider call failed',
              },
              this.secrets,
            )
          : null,
      };
      for (const sink of this.sinks) await sink.write(trace);
    }
  }
}
