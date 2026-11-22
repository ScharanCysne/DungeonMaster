import { configSchema } from '@dungeon/shared';
import { createGenerators } from '../agents/generators/index.js';
import {
  AnthropicProvider,
  MemoryTraceSink,
  TracingProvider,
} from '../agents/llm/index.js';
import { BeatContext } from '../agents/tools/BeatContext.js';
import { executeToolCall } from '../agents/tools/execute.js';
import { failure } from '../agents/tools/types.js';
import { loadEpisode } from '../content/index.js';
import { Engine } from '../engine/index.js';
import { envelopeDrafts } from '../ontology/eventLog.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { project } from '../ontology/projector.js';
import { projectSeed } from '../ontology/seedProjection.js';
import type { LogDraft } from '../ontology/eventLog.js';
import { spriteFallbackStats } from './genSampleStats.js';

const content = await loadEpisode();
if (content.problems.length) throw new Error(content.problems.join('; '));
const config = configSchema.parse({ timeouts: { providerRetries: 0 } });
const trace = new MemoryTraceSink();
const provider = new TracingProvider(
  new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    config,
  }),
  [trace],
  { config },
);
const generators = createGenerators({ provider, sprites: content.sprites });
const store = new MemoryStore();
await store.apply(projectSeed(content.seed));
const engine = new Engine(content.seed, content.grid, 'generator-sample');
const sampleEvents: LogDraft[] = [];
const calls = [
  {
    name: 'generate_item',
    input: {
      brief: 'A nervous merchant’s inexpensive keepsake',
      placement: 'char:brann',
      constraints: { kind: 'trinket' },
    },
  },
  {
    name: 'generate_item',
    input: {
      brief: 'A battered kitchen implement with a small history',
      placement: 'loc:kitchen',
      constraints: { kind: 'tool' },
    },
  },
  {
    name: 'generate_item',
    input: {
      brief: 'A weather-stained receipt with a mundane dispute',
      placement: 'container:barrel-1',
      constraints: { kind: 'document' },
    },
  },
  {
    name: 'generate_item',
    input: {
      brief: 'A modest travellers’ remedy',
      placement: 'char:kael',
      constraints: { kind: 'consumable', maxRarity: 'common' },
    },
  },
  {
    name: 'generate_item',
    input: {
      brief: 'A small piece of salvage someone left behind',
      placement: 'loc:common-room',
      constraints: { kind: 'treasure' },
    },
  },
  {
    name: 'generate_npc',
    input: {
      brief: 'A quiet cooper waiting for a delivery',
      locationId: 'loc:common-room',
      hints: { role: 'cooper', attitudeToParty: 10 },
    },
  },
  {
    name: 'generate_npc',
    input: {
      brief: 'An impatient courier sheltering from rain',
      locationId: 'loc:common-room',
      hints: { role: 'courier', attitudeToParty: -10 },
    },
  },
  {
    name: 'generate_feature',
    input: {
      brief: 'A small concealed storage recess',
      locationId: 'loc:kitchen',
      hidden: true,
      locked: false,
    },
  },
  {
    name: 'generate_story',
    input: {
      brief: 'A brief piece of tavern lore about an old gathering',
      about: ['loc:common-room'],
      kind: 'lore',
    },
  },
];

try {
  // Nine samples need three beats under the ordinary generator cap.
  for (
    let offset = 0;
    offset < calls.length;
    offset += config.limits.generatorCalls
  ) {
    const beat = offset / config.limits.generatorCalls + 1;
    engine.beginBeat(beat);
    const ctx = new BeatContext({
      engine,
      store,
      generators,
      config,
      npcVoice: {
        voice: () =>
          Promise.resolve(
            failure('UNUSED', 'Voice is not used by this sample.'),
          ),
      },
    });
    for (const call of calls.slice(
      offset,
      offset + config.limits.generatorCalls,
    )) {
      const firstEvent = ctx.events.length;
      try {
        const result = await executeToolCall(call.name, call.input, ctx);
        console.log(
          JSON.stringify({
            beat,
            tool: call.name,
            ...(result.ok
              ? { ok: true, value: result.value, description: result.facts }
              : { ok: false, error: result.error }),
          }),
        );
        if (!result.ok) process.exitCode = 1;
      } catch (error) {
        console.log(
          JSON.stringify({
            beat,
            tool: call.name,
            ok: false,
            error:
              error instanceof Error ? error.message : 'Generation failed.',
          }),
        );
        throw error;
      } finally {
        sampleEvents.push(...ctx.events.slice(firstEvent));
      }
    }
    await store.apply(
      envelopeDrafts(ctx.events, {
        sessionId: 'generator-sample',
        beat,
        traceId: `sample-${beat}`,
        createdBy: 'engine',
      }).flatMap(project),
    );
  }
} finally {
  console.log(
    JSON.stringify({
      ...spriteFallbackStats(sampleEvents, content.sprites),
      calls: trace.records.length,
      costUsd: trace.records.reduce((sum, record) => sum + record.costUsd, 0),
      latencyMs: trace.records.reduce(
        (sum, record) => sum + record.latencyMs,
        0,
      ),
    }),
  );
}
