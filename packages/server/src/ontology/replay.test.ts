import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { ApplyDamageInput } from '@dungeon/shared';
import { Engine } from '../engine/index.js';
import { gridFixture } from '../engine/testing/fixtures.js';
import { EventLog, readEventLog } from './eventLog.js';
import { MemoryStore } from './MemoryStore.js';
import { project } from './projector.js';
import { verify } from './verify.js';
import { graphSnapshot, ontologySeed, seedRecord } from './testing/fixtures.js';
import { hardState, scriptedBeats } from './testing/session.js';

it('replays a committed multi-beat session into identical engine and graph states, including active combat', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dungeon-replay-'));
  try {
    const seed = ontologySeed();
    const grid = gridFixture();
    const live = new Engine(seed, grid, 'fixture');
    const graph = new MemoryStore();
    const log = new EventLog(dataDir, 'session');
    const initial = await log.commitBeat(
      { beat: 0, traceId: 'seed', createdBy: 'seed' },
      [seedRecord(seed)],
    );
    for (const record of initial) await graph.apply(project(record));
    for (const [index, play] of scriptedBeats.entries()) {
      const beat = index + 1;
      live.beginBeat(beat);
      play(live);
      const records = await log.commitBeat(
        { beat, traceId: `beat-${beat}`, createdBy: 'engine' },
        [
          {
            type: 'BeatStarted',
            payload: { attempt: 0 },
            actor: null,
            private: false,
            witnesses: [],
          },
          ...live.collectEvents(),
        ],
      );
      for (const record of records) {
        await graph.apply(project(record));
        const once = await graphSnapshot(graph);
        await graph.apply(project(record));
        expect(await graphSnapshot(graph)).toEqual(once);
      }
      expect(await verify(live.state, graph)).toEqual([]);
      const logRead = await readEventLog(dataDir, 'session');
      expect(logRead.droppedRecords).toBe(0);
      const replayed = Engine.fromLog(logRead.records, grid);
      expect(hardState(replayed.state)).toEqual(hardState(live.state));
      expect(replayed.state.receipts.size).toBe(0);
      const rebuilt = new MemoryStore();
      for (const record of logRead.records)
        await rebuilt.apply(project(record));
      expect(await graphSnapshot(rebuilt)).toEqual(await graphSnapshot(graph));
      expect(await verify(replayed.state, rebuilt)).toEqual([]);
      if (beat === 5) expect(replayed.state.combat?.moved).toBe(true);
      if (beat === scriptedBeats.length) {
        live.beginBeat(beat + 1, 2);
        replayed.beginBeat(beat + 1, 2);
        const input: ApplyDamageInput = {
          target: 'char:player',
          dice: '1d6',
          cause: 'Replay determinism',
        };
        expect(replayed.apply_damage(input)).toEqual(live.apply_damage(input));
      }
    }
    const types = new Set(
      (await readEventLog(dataDir, 'session')).records.map(
        (record) => record.type,
      ),
    );
    expect(types).toEqual(
      new Set([
        'SeedLoaded',
        'BeatCommitted',
        'BeatStarted',
        'EntityMoved',
        'CheckRolled',
        'EntityRevealed',
        'EntityHidden',
        'ContainerUnlocked',
        'ContainerOpened',
        'ItemTransferred',
        'ItemEquipped',
        'ItemUnequipped',
        'DamageApplied',
        'Healed',
        'CombatStarted',
        'AttackResolved',
        'TurnAdvanced',
        'CombatEnded',
      ]),
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
