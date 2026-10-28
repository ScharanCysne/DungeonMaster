import { configSchema } from '@dungeon/shared';
import { createDmBeat } from '../agents/dm/index.js';
import type { DmIntents } from '../agents/dm/index.js';
import { createGenerators } from '../agents/generators/index.js';
import { AnthropicProvider } from '../agents/llm/index.js';
import { BeatContext } from '../agents/tools/BeatContext.js';
import { success } from '../agents/tools/types.js';
import { loadEpisode } from '../content/index.js';
import { Engine } from '../engine/index.js';
import { envelopeDrafts } from '../ontology/eventLog.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { project } from '../ontology/projector.js';
import { projectSeed } from '../ontology/seedProjection.js';

const config = configSchema.parse({ timeouts: { providerRetries: 0 } });
const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  config,
});
const content = await loadEpisode();
if (content.problems.length) throw new Error(content.problems.join('; '));
const generators = createGenerators({ provider, sprites: content.sprites });
const store = new MemoryStore();
await store.apply(projectSeed(content.seed));
const engine = new Engine(content.seed, content.grid, 'dm-sample');
let voiceLine = 0;
const beats: DmIntents[] = [
  {
    player: {
      selection: ['container:floorboard', 'char:brann'],
      text: 'While Brann is busy with Tobb, I pry up the loose floorboard.',
    },
    peers: [
      {
        actor: 'char:ilsa',
        turn: {
          kind: 'intent',
          text: 'I keep Brann talking so he does not notice.',
          say: 'Brann, love, is that a new keg? Tell me all about it. Slowly.',
          refs: ['char:brann'],
          private: false,
        },
      },
    ],
  },
  {
    player: {
      selection: [],
      text: 'I search the room for anything else hidden',
    },
    peers: [],
  },
];

for (const [index, intents] of beats.entries()) {
  const beat = index + 1;
  engine.beginBeat(beat);
  const ctx = new BeatContext({
    engine,
    store,
    config,
    generators,
    peerSayLines: intents.peers.flatMap(({ actor, turn }) =>
      turn.kind === 'intent' && turn.say !== undefined
        ? [{ speaker: actor, text: turn.say }]
        : [],
    ),
    npcVoice: {
      voice: (input) =>
        Promise.resolve(
          success(
            {
              lineId: `sample-voice-${++voiceLine}`,
              text: `(voice stub) ${input.direction}`,
            },
            [],
            ['Stub voice returned the direction.'],
          ),
        ),
    },
  });
  const dm = await createDmBeat({ provider, ctx, seed: content.seed, intents });
  const result = await dm.run();
  for (const { iteration, usage } of result.iterationUsage)
    console.log(
      JSON.stringify({
        beat,
        iteration,
        uncachedInputTokens: usage?.inputTokens ?? null,
        cacheReadInputTokens: usage?.cacheReadInputTokens ?? null,
        cacheWriteInputTokens: usage?.cacheCreationInputTokens ?? null,
      }),
    );
  for (const call of result.toolCalls)
    console.log(
      JSON.stringify({
        beat,
        tool: call.name,
        input: call.input,
        ...(call.ok ? { ok: true } : { ok: false, error: call.error }),
      }),
    );
  console.log(
    JSON.stringify({
      beat,
      status: result.status,
      narration: result.narration,
    }),
  );
  console.log(
    JSON.stringify({
      beat,
      iterations: result.iterations,
      usage: result.usage,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed,
      droppedContext: result.droppedContext,
    }),
  );
  if (!result.narration) {
    engine.rollback();
    throw new Error(
      `DM sample beat ${beat}: ${result.status}; no narration to commit.`,
    );
  }
  // This diagnostic commits locally without the slice 11 critic, so beat two sees beat one.
  await store.apply(
    envelopeDrafts(
      [
        ...ctx.events,
        {
          type: 'NarrationCommitted',
          payload: result.narration,
          actor: null,
          private: false,
          witnesses: ['char:kael'],
        },
        {
          type: 'BeatCommitted',
          payload: {},
          actor: null,
          private: false,
          witnesses: [],
        },
      ],
      {
        sessionId: 'dm-sample',
        beat,
        traceId: `dm-sample-${beat}`,
        createdBy: 'engine',
      },
    ).flatMap(project),
  );
}
