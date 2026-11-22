import { configSchema } from '@dungeon/shared';
import type { Fact, ResolvedNarration } from '@dungeon/shared';
import { reviewBeat } from '../agents/critic/index.js';
import { createDmBeat } from '../agents/dm/index.js';
import type { DmIntents } from '../agents/dm/index.js';
import { createGenerators } from '../agents/generators/index.js';
import {
  AnthropicProvider,
  MemoryTraceSink,
  TracingProvider,
} from '../agents/llm/index.js';
import { createNpcVoice } from '../agents/npc-voice/index.js';
import {
  initialRotation,
  peerSayLines,
  recordPeerTurns,
  rotatePeers,
  runPeer,
} from '../agents/peers/index.js';
import { BeatContext } from '../agents/tools/BeatContext.js';
import { loadEpisode } from '../content/index.js';
import { Engine } from '../engine/index.js';
import { envelopeDrafts } from '../ontology/eventLog.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { project } from '../ontology/projector.js';
import { knowledgeSlice } from '../ontology/queries/knowledge.js';
import { projectSeed } from '../ontology/seedProjection.js';

const config = configSchema.parse({ timeouts: { providerRetries: 0 } });
const sink = new MemoryTraceSink();
const provider = new TracingProvider(
  new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    config,
  }),
  [sink],
  { config },
);
const content = await loadEpisode();
if (content.problems.length) throw new Error(content.problems.join('; '));
const store = new MemoryStore();
await store.apply(projectSeed(content.seed));
const engine = new Engine(content.seed, content.grid, 'agents-sample');
const generators = createGenerators({ provider, sprites: content.sprites });
const npcVoice = createNpcVoice({ provider });
let rotation = initialRotation();
let lastNarration: ResolvedNarration | undefined;
const intents: DmIntents['player'][] = [
  {
    selection: ['char:brann'],
    text: 'I lean on the bar and ask Brann, casually, whether old Odo ever left anything behind.',
  },
  {
    selection: [],
    text: 'I glance at the hooded stranger and ask Doran, quietly, what he makes of him.',
  },
];

for (const [index, player] of intents.entries()) {
  const beat = index + 1;
  const traceStart = sink.records.length;
  engine.beginBeat(beat);
  try {
    const selection = rotatePeers(
      content.seed.characters.filter(({ role }) => role === 'peer'),
      player,
      rotation,
    );
    const peers = [];
    for (const actor of selection.selected)
      peers.push(
        await runPeer(provider, {
          knowledge: await knowledgeSlice(store, actor),
          player,
          ...(lastNarration ? { lastNarration } : {}),
          consecutivePasses: rotation.consecutivePasses[actor] ?? 0,
          timeoutMs: config.timeouts.othersMs,
          debugFacts: (await store.nodes()).filter(
            (node): node is Fact => 'statement' in node,
          ),
        }),
      );
    const ctx = new BeatContext({
      engine,
      store,
      config,
      generators,
      npcVoice,
      peerSayLines: peerSayLines(peers),
    });
    const dmIntents = { player, peers };
    const dm = await createDmBeat({
      provider,
      ctx,
      seed: content.seed,
      intents: dmIntents,
    });
    const result = await reviewBeat({
      provider,
      ctx,
      dm,
      result: await dm.run(),
      intents: dmIntents,
    });
    console.log(
      JSON.stringify({
        beat,
        peers,
        toolCalls: result.dmResult.toolCalls,
        npcLines: [...ctx.voicedLines].map(([lineId, line]) => ({
          lineId,
          ...line,
        })),
        critic: result.verdicts,
        criticFailures: result.checks.flatMap(({ failure }) =>
          failure ? [failure] : [],
        ),
        retry: result.retry,
        fallback: result.fallback,
        flags: result.flags,
        narration: result.narration,
      }),
    );
    const records = sink.records.slice(traceStart);
    for (const role of [
      'peer',
      'dm',
      'npc_voice',
      'critic',
      'generator',
      'story',
    ] as const) {
      const calls = records.filter((record) => record.role === role);
      console.log(
        JSON.stringify({
          beat,
          role,
          calls: calls.length,
          costUsd: calls.reduce((sum, call) => sum + call.costUsd, 0),
          latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
        }),
      );
    }
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
          sessionId: 'agents-sample',
          beat,
          traceId: `agents-sample-${beat}`,
          createdBy: 'engine',
        },
      ).flatMap(project),
    );
    // Retain attempts with no actor event; the session runner can supply richer resolution tracking.
    const pending = peers
      .filter(
        ({ actor, turn }) =>
          turn.kind === 'intent' &&
          !ctx.events.some((event) => event.actor === actor),
      )
      .map(({ actor }) => actor);
    rotation = recordPeerTurns(selection.state, peers, pending);
    lastNarration = result.narration;
  } catch (error) {
    engine.rollback();
    throw error;
  }
}
