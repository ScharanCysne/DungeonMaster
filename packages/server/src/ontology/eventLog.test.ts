import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEventSchema } from '@dungeon/shared';
import {
  EventLog,
  envelopeDrafts,
  parseLog,
  readEventLog,
} from './eventLog.js';
import { record } from './testing/fixtures.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof fs>();
  return { ...actual, open: vi.fn(actual.open) };
});
let dataDir: string;
const envelope = {
  sessionId: 'session',
  beat: 1,
  createdBy: 'engine',
  traceId: 'trace',
} as const;
const draft = {
  type: 'EntityHidden',
  actor: 'char:player',
  payload: { entityId: 'char:player' },
  private: false,
  witnesses: ['char:player'],
} as const;
function drafts() {
  return [{ ...draft, witnesses: [...draft.witnesses] }];
}
const jsonl = (records: unknown[]) =>
  records.map((record) => JSON.stringify(record)).join('\n') + '\n';

beforeEach(async () => {
  dataDir = await fs.mkdtemp(join(tmpdir(), 'dungeon-log-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe('event log', () => {
  it('preserves per-draft provenance while defaulting older drafts to the beat envelope', () => {
    const records = envelopeDrafts(
      [
        ...drafts(),
        ...drafts().map((event) => ({ ...event, createdBy: 'dm' as const })),
      ],
      envelope,
    );
    expect(records.map((event) => event.createdBy)).toEqual(['engine', 'dm']);
  });
  it('envelopes detached, validated records with sequences from zero', () => {
    const input = drafts();
    const records = envelopeDrafts([...input, ...input], envelope);
    expect(records.map((event) => event.seq)).toEqual([0, 1]);
    for (const event of records)
      expect(gameEventSchema.parse(event)).toEqual(event);
    records[0]?.witnesses.push('char:peer');
    expect(input[0]?.witnesses).toEqual(['char:player']);
    expect(() => envelopeDrafts(input, { ...envelope, beat: -1 })).toThrow();
  });
  it('appends events and marker in exactly one write, then fsyncs and closes', async () => {
    const path = join(dataDir, 'sessions', 'session');
    await fs.mkdir(path, { recursive: true });
    const file = await fs.open(join(path, 'events.jsonl'), 'a');
    const write = vi.spyOn(file, 'write');
    const sync = vi.spyOn(file, 'sync');
    const close = vi.spyOn(file, 'close');
    vi.mocked(fs.open).mockResolvedValueOnce(file);
    const committed = await new EventLog(dataDir, 'session').commitBeat(
      envelope,
      drafts(),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      sync.mock.invocationCallOrder[0] ?? 0,
    );
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(
      close.mock.invocationCallOrder[0] ?? 0,
    );
    expect(committed.at(-1)?.type).toBe('BeatCommitted');
    expect(await readEventLog(dataDir, 'session')).toEqual({
      records: committed,
      droppedRecords: 0,
    });
  });
  it('drops every record of a trailing uncommitted beat', async () => {
    const log = new EventLog(dataDir, 'session');
    const committed = await log.commitBeat(envelope, drafts());
    const trailing = envelopeDrafts([...drafts(), ...drafts()], {
      ...envelope,
      beat: 2,
    });
    await fs.appendFile(
      join(dataDir, 'sessions', 'session', 'events.jsonl'),
      jsonl(trailing),
    );
    expect(await readEventLog(dataDir, 'session')).toEqual({
      records: committed,
      droppedRecords: 2,
    });
    await expect(
      log.commitBeat({ ...envelope, beat: 3 }, drafts()),
    ).rejects.toThrow('uncommitted tail');
  });
  it('also discards a torn last line, but refuses malformed complete lines', () => {
    const committed = [record('BeatCommitted', {})];
    expect(parseLog(jsonl(committed) + '{"v":1')).toEqual({
      records: committed,
      droppedRecords: 1,
    });
    expect(() => parseLog(jsonl(committed) + '{bad}\n')).toThrow(
      'line 2: invalid JSON',
    );
    expect(() => parseLog('{bad}\n' + jsonl(committed))).toThrow(
      'line 1: invalid JSON',
    );
    expect(() => parseLog(jsonl([committed[0], {}]))).toThrow('line 2');
  });
  it.each([2, 17])(
    'refuses major version %s, including in a trailing beat',
    (v) => {
      expect(() =>
        parseLog(jsonl([{ ...record('BeatCommitted', {}), v }])),
      ).toThrow(
        `Unsupported event log major version ${v} at line 1; supported version: 1.`,
      );
    },
  );
  it('rejects gaps, duplicate beats and an uncommitted interior beat', () => {
    expect(() =>
      parseLog(jsonl([record('BeatCommitted', {}, { seq: 1 })])),
    ).toThrow('line 1');
    expect(() =>
      parseLog(
        jsonl([record('BeatCommitted', {}), record('BeatCommitted', {})]),
      ),
    ).toThrow('line 2');
    expect(() =>
      parseLog(
        jsonl([
          record('EntityHidden', { entityId: 'char:player' }),
          record('BeatCommitted', {}, { beat: 2 }),
        ]),
      ),
    ).toThrow('line 2');
  });
  it('serializes concurrent commits, including an empty beat', async () => {
    const log = new EventLog(dataDir, 'session');
    const [one, two] = await Promise.all([
      log.commitBeat(envelope, drafts()),
      log.commitBeat({ ...envelope, beat: 2 }, []),
    ]);
    expect((await readEventLog(dataDir, 'session')).records).toEqual([
      ...one,
      ...two,
    ]);
    await expect(log.commitBeat(envelope, [])).rejects.toThrow('newer');
  });
  it('refuses marker injection and directory traversal', async () => {
    expect(() => new EventLog(dataDir, '../escape')).toThrow('Invalid session');
    await expect(
      new EventLog(dataDir, 'session').commitBeat(envelope, [
        record('BeatCommitted', {}),
      ]),
    ).rejects.toThrow('added by commitBeat');
    expect(await readEventLog(dataDir, 'absent')).toEqual({
      records: [],
      droppedRecords: 0,
    });
  });
  it('reports a short write and closes the file without claiming durability', async () => {
    await fs.mkdir(join(dataDir, 'sessions', 'session'), { recursive: true });
    const file = await fs.open(
      join(dataDir, 'sessions', 'session', 'events.jsonl'),
      'a',
    );
    vi.spyOn(file, 'write').mockImplementation((buffer) =>
      Promise.resolve({ bytesWritten: 1, buffer }),
    );
    const sync = vi.spyOn(file, 'sync');
    const close = vi.spyOn(file, 'close');
    vi.mocked(fs.open).mockResolvedValueOnce(file);
    await expect(
      new EventLog(dataDir, 'session').commitBeat(envelope, drafts()),
    ).rejects.toThrow('Incomplete beat write: 1/');
    expect(sync).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});

it('recovers only a trailing uncommitted beat before appending the retry', async () => {
  const log = new EventLog(dataDir, 'session');
  const committed = await log.commitBeat(envelope, drafts());
  const path = join(dataDir, 'sessions', 'session', 'events.jsonl');
  await fs.appendFile(
    path,
    jsonl(envelopeDrafts(drafts(), { ...envelope, beat: 2 })) + '{"v":1',
  );
  await log.recover();
  expect(await readEventLog(dataDir, 'session')).toEqual({
    records: committed,
    droppedRecords: 0,
  });
  await log.commitBeat({ ...envelope, beat: 2 }, drafts());
  expect((await readEventLog(dataDir, 'session')).records.at(-1)?.beat).toBe(2);
});

it('truncates a failed fsync back to the previous committed beat', async () => {
  const log = new EventLog(dataDir, 'session');
  const committed = await log.commitBeat(envelope, drafts());
  const file = await fs.open(
    join(dataDir, 'sessions', 'session', 'events.jsonl'),
    'a',
  );
  vi.spyOn(file, 'sync').mockRejectedValueOnce(new Error('Disk sync failed.'));
  vi.mocked(fs.open).mockResolvedValueOnce(file);
  await expect(
    log.commitBeat({ ...envelope, beat: 2 }, drafts()),
  ).rejects.toThrow('Disk sync failed.');
  expect(await readEventLog(dataDir, 'session')).toEqual({
    records: committed,
    droppedRecords: 0,
  });
  await log.commitBeat({ ...envelope, beat: 2 }, drafts());
});
