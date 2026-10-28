import { fileURLToPath } from 'node:url';
import type { CriticVerdict, ResolvedNarration } from '@dungeon/shared';
import type { DmIntents, DmToolCall } from '../dm/types.js';
import { LlmUnavailableError } from '../llm/errors.js';
import { loadPrompt } from '../llm/prompts.js';
import type { LlmProvider } from '../llm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { criticContext } from './context.js';
import { precheck } from './precheck.js';
import type { PrecheckResult } from './precheck.js';
import { criticOutputSchema } from './schema.js';
import type { CriticOutput, SelfLeak } from './schema.js';
import { validSelfLeaks } from './selfLeak.js';

export interface CriticOptions {
  provider: LlmProvider;
  promptDirectory?: string;
}
export interface CriticCheck {
  verdict: CriticVerdict | null;
  precheck: PrecheckResult;
  output: CriticOutput | null;
  selfLeaks: SelfLeak[];
  failure?: string;
}

export async function checkNarration(
  options: CriticOptions,
  ctx: BeatContext,
  narration: ResolvedNarration,
  toolCalls: readonly DmToolCall[],
  intents: DmIntents,
): Promise<CriticCheck> {
  const context = await criticContext(ctx, narration, toolCalls, intents);
  const deterministic = precheck(context.deterministic);
  const prompt = await loadPrompt(
    'critic',
    options.promptDirectory ??
      fileURLToPath(new URL('../prompts/', import.meta.url)),
  );
  try {
    const response = await options.provider.complete({
      role: 'critic',
      outputFormat: criticOutputSchema,
      system: [{ text: prompt.text, cache: true }],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            ...context.data,
            precheckIssues: deterministic.issues,
            unspentReceiptHints: deterministic.unspentReceipts,
          }),
        },
      ],
      maxTokens: 4096,
      timeoutMs: ctx.config.timeouts.othersMs,
      promptVersion: `critic:${prompt.version}`,
    });
    if (response.stopReason !== 'end_turn')
      throw new Error(`Critic stopped with ${response.stopReason}.`);
    const output = criticOutputSchema.parse(response.parsedOutput);
    const selfLeaks = validSelfLeaks(
      output.selfLeaks,
      narration,
      context.speaking,
    );
    // A deliberate peer disclosure can establish the player's knowledge in this very line.
    const afterDisclosures = precheck({
      ...context.deterministic,
      disclosures: selfLeaks.map((leak) => ({
        ...leak,
        entities: context.edges
          .filter((edge) => edge.type === 'ABOUT' && edge.from === leak.factId)
          .map(({ to }) => to),
      })),
    });
    const issues = [
      ...afterDisclosures.issues,
      ...(output.verdict.ok
        ? []
        : output.verdict.issues.filter(
            (issue) =>
              !(
                (issue.type === 'perspective_leak' ||
                  issue.type === 'npc_knowledge_leak') &&
                issue.quote.length > 0 &&
                selfLeaks.some((leak) => leak.quote.includes(issue.quote)) &&
                !narration.text.includes(issue.quote) &&
                narration.lines
                  .filter((line) => line.text.includes(issue.quote))
                  .every((line) =>
                    selfLeaks.some(
                      (leak) =>
                        leak.speaker === line.speaker &&
                        leak.quote.includes(issue.quote),
                    ),
                  )
              ),
          )),
    ];
    return {
      verdict: issues.length ? { ok: false, issues } : { ok: true },
      precheck: deterministic,
      output,
      selfLeaks,
    };
  } catch (error) {
    if (error instanceof LlmUnavailableError) throw error;
    return {
      verdict: deterministic.issues.length
        ? { ok: false, issues: deterministic.issues }
        : null,
      precheck: deterministic,
      output: null,
      selfLeaks: [],
      failure: error instanceof Error ? error.message : 'Critic output failed.',
    };
  }
}
