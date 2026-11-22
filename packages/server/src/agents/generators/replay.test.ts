import { generateItemOutputSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { Engine } from '../../engine/index.js';
import { envelopeDrafts, parseLog } from '../../ontology/eventLog.js';
import type { LogDraft } from '../../ontology/eventLog.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { project } from '../../ontology/projector.js';
import { graphSnapshot } from '../../ontology/testing/fixtures.js';
import { BeatContext } from '../tools/BeatContext.js';
import { executeToolCall } from '../tools/execute.js';
import {
  feature,
  featureInput,
  fixture,
  item,
  itemInput,
  npc,
  npcInput,
  story,
  storyInput,
  structured,
} from './testing.js';

const marker: LogDraft = {
  type: 'BeatCommitted',
  payload: {},
  actor: null,
  private: false,
  witnesses: [],
};
const envelope = {
  sessionId: 'replay-generators',
  traceId: 'trace',
  createdBy: 'engine' as const,
};

it('replays committed generated entities, inventory transfers, facts, sprites and relationships identically', async () => {
  const rawNpc = {
    ...npc,
    startingItems: [
      {
        ...item,
        item: { ...item.item, name: 'Cooper Wedge', tags: ['tools', 'wedge'] },
      },
    ],
  };
  const { ctx, engine, store, seed, grid, provider } = await fixture([
    structured(item),
    structured(rawNpc),
    structured(feature),
  ]);
  const seeded = envelopeDrafts(
    [
      {
        type: 'SeedLoaded',
        payload: { seed, rngSeed: 'fixture' },
        actor: null,
        private: false,
        witnesses: [],
        createdBy: 'seed',
      },
      marker,
    ],
    { ...envelope, beat: 0 },
  );
  expect(
    (
      await executeToolCall(
        'open_container',
        { actor: 'char:player', container: 'container:box' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  const created = await executeToolCall('generate_item', itemInput, ctx);
  if (!created.ok) throw new Error(created.error.message);
  const value = generateItemOutputSchema.parse(created.value);
  expect(
    (
      await executeToolCall(
        'transfer_item',
        {
          item: value.item.id,
          to: 'char:player',
          actor: 'char:player',
          reason: 'pick_up',
        },
        ctx,
      )
    ).ok,
  ).toBe(true);
  expect((await executeToolCall('generate_npc', npcInput, ctx)).ok).toBe(true);
  expect(
    (await executeToolCall('generate_feature', featureInput, ctx)).ok,
  ).toBe(true);
  const first = envelopeDrafts([...ctx.events, marker], {
    ...envelope,
    beat: 1,
  });
  await store.apply(first.flatMap(project));
  engine.beginBeat(2);
  provider.enqueue('story', structured(story));
  const next = new BeatContext({
    engine,
    store,
    generators: ctx.generators,
    npcVoice: ctx.npcVoice,
  });
  expect((await executeToolCall('generate_story', storyInput, next)).ok).toBe(
    true,
  );
  const second = envelopeDrafts([...next.events, marker], {
    ...envelope,
    beat: 2,
  });
  await store.apply(second.flatMap(project));
  const { records, droppedRecords } = parseLog(
    [...seeded, ...first, ...second]
      .map((record) => JSON.stringify(record))
      .join('\n') + '\n',
  );
  expect(droppedRecords).toBe(0);
  const replayed = Engine.fromLog(records, grid);
  replayed.beginBeat(2);
  expect(replayed.state).toEqual(engine.state);
  const rebuilt = new MemoryStore();
  for (const record of records) await rebuilt.apply(project(record));
  expect(await graphSnapshot(rebuilt)).toEqual(await graphSnapshot(store));
  await rebuilt.apply(records.flatMap(project));
  expect(await graphSnapshot(rebuilt)).toEqual(await graphSnapshot(store));
  expect(
    records
      .filter((record) => record.type === 'EntityCreated')
      .map((record) => record.createdBy),
  ).toEqual([
    'generator:item',
    'generator:npc',
    'generator:item',
    'generator:feature',
  ]);
});
