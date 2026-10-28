import { defaultConfig } from '@dungeon/shared';
import type { Config } from '@dungeon/shared';
import { loadEpisode } from '../../content/index.js';
import { Engine } from '../../engine/index.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { projectSeed } from '../../ontology/seedProjection.js';
import { ScriptedProvider } from '../llm/ScriptedProvider.js';
import type { ScriptedReply } from '../llm/ScriptedProvider.js';
import type {
  LlmContentBlock,
  LlmResponse,
  ToolUseBlock,
} from '../llm/types.js';
import { BeatContext } from '../tools/BeatContext.js';
import { fakeGenerators, fakeNpcVoice } from '../tools/testing/fakes.js';
import { createDmBeat } from './index.js';
import type { DmIntents } from './types.js';

export const intents: DmIntents = {
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
};
export const attitude = {
  from: 'char:ilsa',
  to: 'char:kael',
  delta: 10,
  reason: 'You helped.',
};
export const narration = { text: 'You pause beside the worn rug.', lines: [] };
export function call(name: string, input: unknown, id = name): ToolUseBlock {
  return { type: 'tool_use', name, input, id };
}
export function turn(...content: LlmContentBlock[]): ScriptedReply {
  return { type: 'tool_use', content };
}
export const finish = turn(call('narrate', narration));
export function response(overrides: Partial<LlmResponse> = {}): LlmResponse {
  return {
    content: [],
    parsedOutput: null,
    stopReason: 'end_turn',
    model: 'claude-opus-5-5',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationInputTokens: 20,
      cacheReadInputTokens: 30,
      cacheCreation: { ephemeral5mInputTokens: 0, ephemeral1hInputTokens: 20 },
    },
    costUsd: 0.01,
    latencyMs: 15,
    fallbackUsed: false,
    ...overrides,
  };
}

export async function fixture(
  replies: ScriptedReply[] = [],
  config: Config = defaultConfig,
) {
  const content = await loadEpisode();
  const store = new MemoryStore();
  await store.apply(projectSeed(content.seed));
  const engine = new Engine(content.seed, content.grid, 'dm-test');
  engine.beginBeat(1);
  const npcVoice = fakeNpcVoice();
  const ctx = new BeatContext({
    engine,
    store,
    config,
    generators: fakeGenerators(),
    npcVoice,
    peerSayLines: intents.peers.flatMap(({ actor, turn }) =>
      turn.kind === 'intent' && turn.say
        ? [{ speaker: actor, text: turn.say }]
        : [],
    ),
  });
  const provider = new ScriptedProvider({ dm: replies });
  const dm = await createDmBeat({
    provider,
    ctx,
    seed: content.seed,
    intents,
    recap: 'Rain has kept you at the tavern.',
  });
  return { ...content, store, engine, ctx, provider, dm, npcVoice };
}
