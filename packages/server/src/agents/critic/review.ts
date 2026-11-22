import type { CriticVerdict, ResolvedNarration } from '@dungeon/shared';
import { notifyProgress } from '../progress.js';
import type { DmBeat } from '../dm/DmBeat.js';
import type { DmBeatResult, DmIntents } from '../dm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { playerId } from '../tools/validation.js';
import { checkNarration } from './check.js';
import type { CriticCheck, CriticOptions } from './check.js';
import { learnSelfLeaks } from './selfLeak.js';
import type { SelfLeakFlag } from './selfLeak.js';
import { neutralSummary } from './summary.js';

export interface ReviewResult {
  narration: ResolvedNarration;
  verdicts: (CriticVerdict | null)[];
  checks: CriticCheck[];
  retry: { attempted: boolean; status?: DmBeatResult['status'] };
  fallback: boolean;
  flags: { selfLeaks: SelfLeakFlag[]; criticFailed: boolean };
  dmResult: DmBeatResult;
}

export async function reviewBeat(
  options: CriticOptions & {
    ctx: BeatContext;
    dm: Pick<DmBeat, 'retryNarration'>;
    result: DmBeatResult;
    intents: DmIntents;
    onCheck?: (check: CriticCheck) => void;
    onStatus?: (phase: 'critic' | 'dm_retry') => void;
  },
): Promise<ReviewResult> {
  const { ctx, dm, intents } = options;
  let result = options.result;
  const checks: CriticCheck[] = [];
  const retry: ReviewResult['retry'] = { attempted: false };
  for (
    let attempt = 0;
    attempt < 2 && result.status === 'narrated' && result.narration;
    attempt++
  ) {
    notifyProgress(options.onStatus, 'critic');
    const check = await checkNarration(
      options,
      ctx,
      result.narration,
      result.toolCalls,
      intents,
    );
    checks.push(check);
    options.onCheck?.(check);
    if (check.verdict?.ok) {
      const selfLeaks = await learnSelfLeaks(ctx, check.selfLeaks);
      ctx.narration = structuredClone(result.narration);
      ctx.finished = true;
      return {
        narration: result.narration,
        verdicts: checks.map(({ verdict }) => verdict),
        checks,
        retry,
        fallback: false,
        flags: {
          selfLeaks,
          criticFailed: checks.some(({ failure }) => !!failure),
        },
        dmResult: result,
      };
    }
    if (attempt || !check.verdict || check.verdict.ok) break;
    retry.attempted = true;
    notifyProgress(options.onStatus, 'dm_retry');
    result = await dm.retryNarration(check.verdict.issues);
    retry.status = result.status;
  }
  ctx.collectEngineEvents();
  const narration = neutralSummary(ctx.events, playerId(ctx));
  ctx.narration = narration;
  ctx.finished = true;
  return {
    narration,
    verdicts: checks.map(({ verdict }) => verdict),
    checks,
    retry,
    fallback: true,
    flags: {
      selfLeaks: [],
      criticFailed: checks.some(({ failure }) => !!failure),
    },
    dmResult: result,
  };
}
