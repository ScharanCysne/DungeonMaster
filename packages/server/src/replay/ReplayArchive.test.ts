import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import {
  accepted,
  calls,
  content,
  harness,
  narrate,
  pass,
  playerIntent,
} from '../beat/testing/harness.js';
import { Engine } from '../engine/index.js';
import type { EngineState } from '../engine/state.js';
import { logPath } from '../ontology/eventLog.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { PlayerHistory } from '../server/history.js';
import { ReplayArchive } from './ReplayArchive.js';

function world(state: EngineState) {
  return {
    beat: state.beat,
    characters: state.characters,
    containers: state.containers,
    items: state.items,
    locations: state.locations,
    combat: state.combat,
  };
}

test('seeks match live engine and perspective at every beat, applying at most nine beats after a checkpoint', async () => {
  const provider = new ScriptedProvider({
    peer: Array.from({ length: 48 }, () => pass),
    dm: Array.from({ length: 24 }, (_, index) =>
      calls(
        {
          name: 'move',
          input: {
            actor: 'char:kael',
            to: index % 2 === 0 ? 'loc:kitchen' : 'loc:common-room',
          },
        },
        narrate,
      ),
    ),
    critic: Array.from({ length: 24 }, () => accepted),
    recap: [
      { type: 'structured', output: { text: 'You explored the tavern.' } },
      { type: 'structured', output: { text: 'Your search continues.' } },
    ],
  });
  const { session, dataDir } = await harness({ provider });
  const history = new PlayerHistory(
    'char:kael',
    content.seed.mapId,
    true,
    content.grid,
  );
  await history.sync(session.records);
  const expected = [
    {
      engine: world(session.engine.state),
      snapshot: await history.snapshot(),
      results: structuredClone(history.results),
    },
  ];
  for (let beat = 1; beat <= 24; beat++) {
    await session.submitIntent(playerIntent());
    expect(session.beat).toBe(beat);
    await history.sync(session.records);
    expected.push({
      engine: world(session.engine.state),
      snapshot: await history.snapshot(),
      results: structuredClone(history.results),
    });
  }
  provider.assertDrained();
  expect(expected[1]?.engine.characters).not.toEqual(
    expected[0]?.engine.characters,
  );
  const projection = new MemoryStore();
  const replay = await ReplayArchive.open({
    sessionId: session.id,
    dataDir,
    grid: content.grid,
    dev: true,
    store: projection,
  });
  expect(replay.snapshotBeats).toEqual([0, 10, 20]);
  expect(await projection.nodes()).toEqual(await history.store.nodes());
  expect(await projection.edges()).toEqual(await history.store.edges());
  const replayed = vi.spyOn(Engine.prototype, 'replay');
  for (const beat of [
    24,
    0,
    19,
    10,
    9,
    20,
    11,
    ...Array.from({ length: 25 }, (_, index) => index),
  ]) {
    replayed.mockClear();
    const cursor = await replay.seek(beat);
    expect(world(cursor.engine.state)).toEqual(expected[beat]?.engine);
    expect(cursor.engine.state).toEqual(
      Engine.fromLog(
        session.records.filter((record) => record.beat <= beat),
        content.grid,
      ).state,
    );
    expect(cursor.state.snapshot).toEqual(expected[beat]?.snapshot);
    expect(cursor.state.results).toEqual(expected[beat]?.results);
    expect(cursor.appliedBeats).toBe(beat % 10);
    expect(
      new Set(
        replayed.mock.calls.flatMap(([records]) =>
          records.map((record) => record.beat),
        ),
      ).size,
    ).toBeLessThanOrEqual(9);
  }
  replayed.mockRestore();
  const cursor = await replay.seek(11);
  await cursor.history.store.clear();
  expect((await replay.seek(11)).state.snapshot).toEqual(
    expected[11]?.snapshot,
  );
  await expect(replay.seek(25)).rejects.toThrow('Choose a beat from 0 to 24.');
  await expect(replay.seek(-1)).rejects.toMatchObject({
    code: 'BAD_REPLAY_BEAT',
  });
}, 20_000);

test('unknown major versions are refused with found/supported versions before the projection changes', async () => {
  const { session, dataDir } = await harness();
  const path = logPath(dataDir, session.id);
  const original = await readFile(path, 'utf8');
  await writeFile(path, original.replace('"v":1', '"v":42'));
  const store = new MemoryStore();
  const clear = vi.spyOn(store, 'clear');
  await expect(
    ReplayArchive.open({
      sessionId: session.id,
      dataDir,
      grid: content.grid,
      dev: false,
      store,
    }),
  ).rejects.toThrow(
    'Unsupported event log major version 42 at line 1; supported version: 1.',
  );
  expect(clear).not.toHaveBeenCalled();
});

test('missing log names the exact path and does not create a session', async () => {
  const { dataDir } = await harness();
  await expect(
    ReplayArchive.open({
      sessionId: 'missing',
      dataDir,
      grid: content.grid,
      dev: false,
    }),
  ).rejects.toThrow(`event log not found at ${logPath(dataDir, 'missing')}`);
});
