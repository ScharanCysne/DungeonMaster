import type { CriticIssue } from '@dungeon/shared';
import { LlmRefusalError } from '../llm/errors.js';
import { appendToolResults } from '../llm/toolTurns.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  ToolResultBlock,
  ToolUseBlock,
} from '../llm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { executeToolCall } from '../tools/execute.js';
import { failure } from '../tools/types.js';
import type { Result, ToolRegistry } from '../tools/types.js';
import { DmMetrics } from './metrics.js';
import type { DmBeatResult, DmToolCall, DroppedContext } from './types.js';

export const NARRATE_NOW =
  'Narrate now using only established events and facts. Call narrate once; do not call other tools.';

const NARRATION_ATTEMPTS = 3;

type TurnResult = 'continue' | 'failed' | 'narrated' | 'refused';
interface RetryPolicy {
  remaining: number;
}
interface NarrationPolicy {
  remaining: number;
  error?: string;
}

export class DmBeat {
  #request: LlmRequest;
  #metrics = new DmMetrics();
  #calls: DmToolCall[] = [];
  #started = false;
  #running = false;
  #retried = false;

  constructor(
    private readonly options: {
      provider: LlmProvider;
      ctx: BeatContext;
      registry: ToolRegistry;
      request: LlmRequest;
      droppedContext: DroppedContext;
    },
  ) {
    this.#request = options.request;
  }

  async run(): Promise<DmBeatResult> {
    if (this.#started) throw new Error('A DM beat can only run once.');
    this.#started = true;
    return this.loop();
  }

  get diagnostics(): DmBeatResult {
    return this.result(this.options.ctx.narration ? 'narrated' : 'noNarration');
  }

  async retryNarration(issues: readonly CriticIssue[]): Promise<DmBeatResult> {
    if (this.#running || this.#retried || !this.options.ctx.narration)
      throw new Error(
        'A completed narration permits exactly one critic retry.',
      );
    if (!issues.length)
      throw new Error('A narration retry requires critic issues.');
    this.#retried = true;
    const allowStateChanges = issues.some(
      (issue) => issue.type === 'unbacked_outcome',
    );
    const remaining = allowStateChanges
      ? Math.min(2, this.options.ctx.limits.retryToolCallsForUnbackedOutcome)
      : 0;
    this.options.ctx.beginNarrationRetry(allowStateChanges);
    this.appendUser(
      [
        `The critic rejected the proposed narration. Correct these issues: ${JSON.stringify(issues)}`,
        remaining
          ? `You may make up to ${remaining} more non-narrate tool attempts to repair an unbacked outcome, then call narrate.`
          : 'This retry is narration-only. Only narrate is allowed; reuse existing voice lineIds and exact peer say lines.',
      ].join('\n'),
    );
    return this.loop({ remaining });
  }

  private appendUser(content: string): void {
    this.#request = {
      ...this.#request,
      messages: [...this.#request.messages, { role: 'user', content }],
    };
  }

  private result(status: DmBeatResult['status']): DmBeatResult {
    return {
      status,
      narration:
        status === 'narrated'
          ? structuredClone(this.options.ctx.narration)
          : undefined,
      toolCalls: structuredClone(this.#calls),
      ...structuredClone({ ...this.#metrics }),
      droppedContext: structuredClone(this.options.droppedContext),
    };
  }

  private async loop(retry?: RetryPolicy): Promise<DmBeatResult> {
    this.#running = true;
    try {
      const ctx = this.options.ctx;
      const narration: NarrationPolicy = { remaining: NARRATION_ATTEMPTS };
      // Even repeated voice calls must eventually yield control.
      const turns = retry
        ? retry.remaining + 1
        : ctx.limits.toolCalls + ctx.limits.voiceNpcPerBeat + 1;
      for (let iteration = 0; iteration < turns; iteration++) {
        const outcome = await this.turn(false, narration, retry);
        if (outcome === 'narrated' || outcome === 'refused')
          return this.result(outcome);
        if (
          narration.error !== undefined ||
          outcome === 'failed' ||
          (retry
            ? retry.remaining === 0
            : ctx.counters.toolCalls >= ctx.toolCallLimit)
        )
          break;
      }
      if (narration.error === undefined) {
        this.appendUser(NARRATE_NOW);
        const outcome = await this.turn(true, narration, retry);
        if (outcome === 'narrated' || outcome === 'refused')
          return this.result(outcome);
      }
      while (narration.error !== undefined && narration.remaining > 0) {
        const before = narration.remaining;
        // Let the model correct the tool error directly before adding a reminder.
        let outcome = await this.turn(true, narration, retry);
        if (outcome === 'narrated' || outcome === 'refused')
          return this.result(outcome);
        if (narration.remaining < before) continue;
        this.appendUser(`${NARRATE_NOW}\n${narration.error}`);
        outcome = await this.turn(true, narration, retry);
        if (outcome === 'narrated' || outcome === 'refused')
          return this.result(outcome);
        // Ignoring both the error and reminder spends this retry opportunity.
        if (narration.remaining === before) narration.remaining--;
      }
      return this.result('noNarration');
    } finally {
      this.#running = false;
    }
  }

  private async execute(
    call: ToolUseBlock,
    forceNarration: boolean,
    narration: NarrationPolicy,
    retry?: RetryPolicy,
  ): Promise<Result<unknown>> {
    const ctx = this.options.ctx;
    if (ctx.finished)
      return failure(
        'BEAT_FINISHED',
        'Narration already succeeded; no further calls are allowed.',
      );
    if (call.name === 'narrate') {
      if (narration.remaining === 0)
        return failure(
          'NARRATION_ATTEMPTS_EXHAUSTED',
          'No narration attempts remain for this loop.',
        );
      narration.remaining--;
      const result = await executeToolCall(
        call.name,
        call.input,
        ctx,
        this.options.registry,
      );
      if (!result.ok) narration.error = result.error.message;
      return result;
    }
    if (forceNarration) return failure('NARRATION_REQUIRED', NARRATE_NOW);
    if (retry) {
      if (retry.remaining === 0)
        return failure(
          'NARRATION_ONLY',
          'The critic retry permits only narrate now; other tools are not allowed.',
        );
      retry.remaining--;
    }
    return executeToolCall(call.name, call.input, ctx, this.options.registry);
  }

  private async turn(
    forceNarration: boolean,
    narration: NarrationPolicy,
    retry?: RetryPolicy,
  ): Promise<TurnResult> {
    this.#metrics.iterations++;
    let response: LlmResponse;
    try {
      response = await this.options.provider.complete(this.#request);
    } catch (error) {
      if (!(error instanceof LlmRefusalError)) throw error;
      this.#metrics.add(error.response);
      return 'refused';
    }
    this.#metrics.add(response);
    if (response.stopReason === 'refusal') return 'refused';
    const calls = response.content.filter((block) => block.type === 'tool_use');
    const failed = response.stopReason !== 'tool_use';
    if (!calls.length) {
      this.#request = {
        ...this.#request,
        messages: [
          ...this.#request.messages,
          { role: 'assistant', content: response.content },
        ],
      };
      return 'failed';
    }
    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      const result = failed
        ? failure(
            'FAILED_TURN',
            `The ${response.stopReason} turn was incomplete; no tools from it were executed. Call narrate using established facts.`,
          )
        : await this.execute(call, forceNarration, narration, retry);
      this.#calls.push({
        name: call.name,
        input: structuredClone(call.input),
        ...(result.ok ? { ok: true } : { ok: false, error: result.error }),
      });
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result),
        ...(!result.ok ? { is_error: true } : {}),
      });
    }
    this.#request = {
      ...this.#request,
      messages: appendToolResults(this.#request.messages, response, results),
    };
    return failed
      ? 'failed'
      : this.options.ctx.finished
        ? 'narrated'
        : 'continue';
  }
}
