import {
  beatResultSchema,
  episodeEndedSchema,
  playerIntentSchema,
} from '@dungeon/shared';
import { TracingProvider } from '../agents/llm/TracingProvider.js';
import { createGenerators } from '../agents/generators/index.js';
import { createNpcVoice } from '../agents/npc-voice/index.js';
import { BeatContext } from '../agents/tools/BeatContext.js';
import { Engine } from '../engine/index.js';
import { envelopeDrafts } from '../ontology/eventLog.js';
import type { LogDraft } from '../ontology/eventLog.js';
import { checkHealth } from './health.js';
import { pauseReason } from './errors.js';
import { Projection } from './Projection.js';
import { Calls } from './Calls.js';
import { Deadline } from './Deadline.js';
import { witnessedRolls } from './drafts.js';
import { prepareBeat } from './prepareBeat.js';
import { beatProgress } from './progress.js';
import type { PreparationDiagnostics } from './prepareBeat.js';
import { validateSelection } from './selection.js';
import { AttemptTrace, metrics } from './traces.js';
import type { BeatRunnerOptions, RunInput, RunResult } from './types.js';

export class BeatRunner {
  #running = false;
  readonly calls = new Calls();
  #trace: AttemptTrace | undefined;
  readonly projection: Projection;
  constructor(private readonly options: BeatRunnerOptions) {
    this.projection = new Projection(options.store);
  }

  async healthCheck(
    reason: Parameters<typeof checkHealth>[0],
  ): Promise<boolean> {
    const provider = this.calls.wrap(
      new TracingProvider(
        this.options.provider,
        this.#trace ? [this.#trace] : [],
        { config: this.options.config, now: () => this.options.clock.now() },
      ),
    );
    return checkHealth(reason, this.options, provider);
  }

  async run(input: RunInput): Promise<RunResult> {
    if (this.#running)
      throw new Error('BeatRunner already has an active beat.');
    const intent = playerIntentSchema.parse(input.intent);
    this.#running = true;
    const { engine, store, log, config, clock, player } = this.options;
    const deadline = new Deadline(clock, config.timeouts.beatMs);
    const start = clock.now();
    const traceId = `beat-${input.beat}-${input.attempt}`;
    const trace = new AttemptTrace(
      log.dataDir,
      log.sessionId,
      input.beat,
      input.attempt,
      this.options.onCost,
    );
    this.#trace = trace;
    const provider = deadline.provider(
      this.calls.wrap(
        new TracingProvider(this.options.provider, [trace], {
          config,
          now: () => clock.now(),
        }),
      ),
    );
    const work = new Engine(
      this.options.content.seed,
      this.options.content.grid,
      engine.state.rngSeed,
    );
    work.restore(engine.snapshot());
    const diagnostics: PreparationDiagnostics = { peers: [], checks: [] };
    const progress = beatProgress(input.beat, (message) => {
      diagnostics.firstFeedbackAt ??= clock.now();
      this.options.onProgress?.(message);
    });
    let committed: RunResult | undefined;
    let preparation: Awaited<ReturnType<typeof prepareBeat>> | undefined;
    let ctx: BeatContext | undefined;
    let failure: unknown;
    try {
      await deadline.wait(validateSelection(store, player, intent));
      work.beginBeat(input.beat, input.attempt);
      ctx = new BeatContext({
        engine: work,
        store,
        config,
        generators: createGenerators({
          provider,
          sprites: this.options.content.sprites,
        }),
        npcVoice: createNpcVoice({ provider, onStatus: progress.status }),
      });
      ctx.appendEvents([
        {
          type: 'BeatStarted',
          payload: { attempt: input.attempt },
          actor: null,
          private: false,
          witnesses: [],
        },
      ]);
      preparation = await deadline.wait(
        prepareBeat(
          this.options,
          { ...input, intent },
          provider,
          ctx,
          diagnostics,
          progress,
          () => deadline.check(),
        ),
      );
      const { review, rotation, recap } = preparation;
      const holder = work.endCondition();
      const drafts: LogDraft[] = ctx.events;
      let ended: RunResult['ended'];
      if (holder) {
        const quest = this.options.content.seed.quests.find(
          ({ kind }) => kind === 'episode',
        );
        if (!quest) throw new Error('Missing episode quest.');
        const character = work.state.characters.get(holder);
        const summary = `${character?.name ?? holder} obtained the quill after ${input.beat} beats.${character?.role === 'peer' ? ' A companion holds the quill as the next chapter begins.' : ''}`;
        drafts.push({
          type: 'EpisodeEnded',
          payload: { holder, questId: quest.id, summary },
          actor: holder,
          private: false,
          witnesses: [player],
        });
        ended = episodeEndedSchema.parse({
          type: 'episode_ended',
          beat: input.beat,
          holder,
          summary,
        });
      }
      drafts.push({
        type: 'NarrationCommitted',
        payload: review.narration,
        actor: null,
        private: false,
        witnesses: [player],
        createdBy: 'dm',
      });
      deadline.check();
      // Once the canonical write starts it must settle; racing fsync could roll back a durable beat.
      const events = envelopeDrafts(drafts, {
        sessionId: log.sessionId,
        beat: input.beat,
        traceId,
        createdBy: 'engine',
      }).filter(({ witnesses }) => witnesses.includes(player));
      const result = beatResultSchema.parse({
        type: 'beat_result',
        beat: input.beat,
        events,
        narration: review.narration,
        rolls: witnessedRolls(events),
        traceId,
      });
      progress.status('committing');
      const records = await log.commitBeat(
        { beat: input.beat, traceId, createdBy: 'engine' },
        drafts,
        { rotation },
      );
      engine.restore(work.snapshot());
      committed = {
        records,
        rotation,
        recap,
        ...(ended ? { ended } : {}),
        result,
      };
      try {
        await deadline.wait(this.projection.apply(records));
      } catch (error) {
        committed.pause = {
          reason:
            clock.now() >= deadline.at
              ? 'graph_unavailable'
              : pauseReason(error),
          error,
          projection: true,
        };
      }
    } catch (error) {
      failure = error;
      if (committed) committed.pause = { reason: 'internal_error', error };
      else work.rollback();
    } finally {
      progress.stop();
      deadline.stop();
      this.#running = false;
      const dm = preparation?.review.dmResult ?? diagnostics.dm?.diagnostics;
      try {
        await trace.finish({
          traceId,
          intents: intent,
          peerTurns: diagnostics.peers,
          events: committed?.records ?? [],
          drafts: ctx?.events ?? [],
          toolCalls: dm?.toolCalls ?? [],
          droppedContext: dm?.droppedContext,
          critic: preparation?.review ?? { checks: diagnostics.checks },
          rotation: committed?.rotation,
          latencyMs: clock.now() - start,
          timeToFirstFeedbackMs:
            diagnostics.firstFeedbackAt === undefined
              ? committed
                ? clock.now() - start
                : null
              : diagnostics.firstFeedbackAt - start,
          metrics: metrics(
            dm,
            preparation?.review,
            diagnostics.peers.reduce(
              (sum, peer) => sum + peer.trace.promptLeaks.length,
              0,
            ),
            diagnostics.checks,
          ),
          outcome: committed
            ? preparation?.review.fallback
              ? 'fallback'
              : 'committed'
            : 'aborted',
          error:
            failure instanceof Error
              ? {
                  name: failure.name,
                  message: failure.message,
                  stack: failure.stack,
                }
              : failure,
          projectionError:
            committed?.pause?.error instanceof Error
              ? committed.pause.error.message
              : undefined,
        });
      } catch (error) {
        if (committed) committed.pause = { reason: 'internal_error', error };
        else failure = error;
      }
    }
    if (committed) return committed;
    throw failure;
  }
}
