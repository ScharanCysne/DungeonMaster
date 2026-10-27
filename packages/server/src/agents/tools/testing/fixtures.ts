import type { Config, EpisodeSeed } from '@dungeon/shared';
import { expect } from 'vitest';
import { Engine } from '../../../engine/index.js';
import { gridFixture } from '../../../engine/testing/fixtures.js';
import { MemoryStore } from '../../../ontology/MemoryStore.js';
import {
  graphSnapshot,
  ontologySeed,
  seedRecord,
} from '../../../ontology/testing/fixtures.js';
import { project } from '../../../ontology/projector.js';
import { BeatContext } from '../BeatContext.js';
import type { SpokenLine } from '../BeatContext.js';
import { executeToolCall } from '../execute.js';
import { fakeGenerators, fakeNpcVoice } from './fakes.js';

export async function fixture(
  options: {
    config?: Config;
    sessionSeed?: string;
    edit?: (seed: EpisodeSeed) => void;
    peerSayLines?: SpokenLine[];
  } = {},
) {
  const seed = ontologySeed();
  options.edit?.(seed);
  const engine = new Engine(
    seed,
    gridFixture(),
    options.sessionSeed ?? 'fixture',
  );
  engine.beginBeat(1);
  const store = new MemoryStore();
  await store.apply(project(seedRecord(seed)));
  const generators = fakeGenerators();
  const npcVoice = fakeNpcVoice();
  const ctx = new BeatContext({
    ...options,
    engine,
    store,
    generators,
    npcVoice,
  });
  return { ctx, engine, store, generators, npcVoice };
}

export async function rejects(
  ctx: BeatContext,
  name: string,
  input: unknown,
  code: string,
  field = '',
) {
  const before = {
    engine: ctx.engine.snapshot(),
    graph: await graphSnapshot(ctx.store),
    events: ctx.events,
    lines: [...ctx.voicedLines],
    narration: ctx.narration,
    finished: ctx.finished,
  };
  const result = await executeToolCall(name, input, ctx);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected a rejected tool call');
  expect(result.error.code).toBe(code);
  expect(result.error.message).toContain(field);
  expect({
    engine: ctx.engine.snapshot(),
    graph: await graphSnapshot(ctx.store),
    events: ctx.events,
    lines: [...ctx.voicedLines],
    narration: ctx.narration,
    finished: ctx.finished,
  }).toEqual(before);
}

export const attitude = {
  from: 'char:peer',
  to: 'char:player',
  delta: 20,
  reason: 'Helped',
};
export const sharing = {
  from: 'char:seller',
  to: ['char:peer'],
  factId: 'fact:rumour',
  source: 'told',
};
export const newFact = {
  statement: 'The moon is painted.',
  truth: true,
  kind: 'lore',
  about: ['loc:room'],
  knownBy: ['char:player'],
};
export const voice = { npc: 'char:seller', direction: 'Mention the moon' };
export const story = {
  brief: 'A moon tale',
  about: ['loc:room'],
  kind: 'lore',
};
