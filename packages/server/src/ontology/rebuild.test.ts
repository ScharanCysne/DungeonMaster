import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from './MemoryStore.js';
import { readRebuildLog, rebuild } from './rebuild.js';
import { logPath, readEventLog } from './eventLog.js';
import { project } from './projector.js';
import { graphSnapshot, seededStore } from './testing/fixtures.js';
import { replayRecords } from './testing/replayRecords.js';

it('rebuilds a replay log in order, replacing prior graph state with one batch per record', async () => {
  const records = replayRecords();
  const expected = new MemoryStore();
  for (const record of records) await expected.apply(project(record));
  const store = await seededStore();
  await store.apply([
    { type: 'setNodeProps', id: 'char:player', props: { hp: 0 } },
  ]);
  const apply = vi.spyOn(store, 'apply');
  expect(await rebuild({ records, droppedRecords: 0 }, store)).toEqual({
    records: records.length,
    nodes: (await expected.nodes()).length,
    edges: (await expected.edges()).length,
  });
  expect(await graphSnapshot(store)).toEqual(await graphSnapshot(expected));
  expect(apply).toHaveBeenCalledTimes(records.length);
});
it('rebuilds an empty log to an empty graph', async () => {
  const store = await seededStore();
  expect(await rebuild({ records: [], droppedRecords: 0 }, store)).toEqual({
    records: 0,
    nodes: 0,
    edges: 0,
  });
});
it('propagates projection failures and leaves earlier committed batches intact', async () => {
  const records = replayRecords();
  const store = new MemoryStore();
  const failure = new Error('Projection failed');
  const first = records[0];
  if (!first) throw new Error('Missing replay seed');
  const expected = new MemoryStore();
  await expected.apply(project(first));
  const apply = store.apply.bind(store);
  vi.spyOn(store, 'apply')
    .mockImplementationOnce(apply)
    .mockRejectedValueOnce(failure);
  await expect(rebuild({ records, droppedRecords: 0 }, store)).rejects.toBe(
    failure,
  );
  expect(await graphSnapshot(store)).toEqual(await graphSnapshot(expected));
});

describe('rebuild log validation', () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'dungeon-rebuild-'));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });
  async function writeLog(contents: string) {
    const file = logPath(dataDir, 'session');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  async function rebuildSession(store: MemoryStore) {
    return rebuild(await readRebuildLog(dataDir, 'session'), store);
  }

  it('rejects a missing session without changing the existing graph', async () => {
    const store = await seededStore();
    const before = await graphSnapshot(store);
    const clear = vi.spyOn(store, 'clear');
    await expect(rebuildSession(store)).rejects.toThrow(
      `Cannot rebuild session session: event log not found at ${logPath(dataDir, 'session')}.`,
    );
    expect(clear).not.toHaveBeenCalled();
    expect(await graphSnapshot(store)).toEqual(before);
    expect(await readEventLog(dataDir, 'session')).toEqual({
      records: [],
      droppedRecords: 0,
    });
  });
  it('validates the entire log before clearing or projecting any records', async () => {
    await writeLog(
      replayRecords()
        .map((record) => JSON.stringify(record))
        .join('\n') + '\n{bad}\n',
    );
    const store = await seededStore();
    const before = await graphSnapshot(store);
    await expect(rebuildSession(store)).rejects.toThrow('invalid JSON');
    expect(await graphSnapshot(store)).toEqual(before);
  });
  it('rejects a log belonging to another session without changing the graph', async () => {
    await writeLog(
      replayRecords()
        .map((record) => JSON.stringify({ ...record, sessionId: 'other' }))
        .join('\n') + '\n',
    );
    const store = await seededStore();
    const before = await graphSnapshot(store);
    await expect(rebuildSession(store)).rejects.toThrow(
      'Event log does not belong to session session.',
    );
    expect(await graphSnapshot(store)).toEqual(before);
  });
  it('clears the graph for an existing empty log', async () => {
    await writeLog('');
    const store = await seededStore();
    expect(await rebuildSession(store)).toEqual({
      records: 0,
      nodes: 0,
      edges: 0,
    });
    expect(await graphSnapshot(store)).toEqual({ nodes: [], edges: [] });
  });
  it('preserves committed records and reports a dropped uncommitted tail', async () => {
    const records = replayRecords();
    await writeLog(
      records.map((record) => JSON.stringify(record)).join('\n') + '\n{"v":',
    );
    expect(await readRebuildLog(dataDir, 'session')).toEqual({
      records,
      droppedRecords: 1,
    });
  });
});
