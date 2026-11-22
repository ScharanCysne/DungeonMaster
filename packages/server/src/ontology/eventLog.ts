import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { gameEventSchema } from '@dungeon/shared';
import type { EventEnvelope, GameEvent, GameEventOf } from '@dungeon/shared';

export type LogDraft = {
  [T in GameEvent['type']]: Pick<
    GameEventOf<T>,
    'type' | 'payload' | 'actor' | 'private' | 'witnesses'
  >;
}[GameEvent['type']] &
  Partial<Pick<EventEnvelope, 'createdBy'>>;
export type BeatEnvelope = Pick<
  EventEnvelope,
  'sessionId' | 'beat' | 'createdBy' | 'traceId'
>;

export function envelopeDrafts(
  drafts: readonly LogDraft[],
  envelope: BeatEnvelope,
): GameEvent[] {
  return drafts.map((draft, seq) =>
    gameEventSchema.parse({
      ...draft,
      ...envelope,
      createdBy: draft.createdBy ?? envelope.createdBy,
      v: 1,
      seq,
    }),
  );
}

export interface LogReadResult {
  records: GameEvent[];
  droppedRecords: number;
}

export function logPath(dataDir: string, sessionId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(sessionId))
    throw new Error(`Invalid session directory name: ${sessionId}`);
  return join(dataDir, 'sessions', sessionId, 'events.jsonl');
}

export function parseLog(contents: string): LogReadResult {
  const records: GameEvent[] = [];
  let pending: GameEvent[] = [];
  const lines = contents.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const [index, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      if (index === lines.length - 1 && !contents.endsWith('\n'))
        return { records, droppedRecords: pending.length + 1 };
      throw new Error(
        `Malformed event log at line ${index + 1}: invalid JSON.`,
      );
    }
    if (typeof raw === 'object' && raw !== null && 'v' in raw && raw.v !== 1)
      throw new Error(
        `Unsupported event log major version ${String(raw.v)} at line ${index + 1}; supported version: 1.`,
      );
    const parsed = gameEventSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        `Malformed event log at line ${index + 1}: ${parsed.error.message}`,
      );
    const record = parsed.data;
    const first = pending[0];
    const last = records.at(-1);
    if (
      record.seq !== pending.length ||
      (first &&
        (record.beat !== first.beat || record.sessionId !== first.sessionId)) ||
      (last &&
        (record.beat <= last.beat || record.sessionId !== last.sessionId))
    )
      throw new Error(
        `Malformed event log at line ${index + 1}: expected a contiguous beat and sequence in one session.`,
      );
    pending.push(record);
    if (record.type === 'BeatCommitted') {
      records.push(...pending);
      pending = [];
    }
  }
  return { records, droppedRecords: pending.length };
}

export async function readEventLog(
  dataDir: string,
  sessionId: string,
): Promise<LogReadResult> {
  try {
    return await readExistingEventLog(dataDir, sessionId);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return { records: [], droppedRecords: 0 };
    throw error;
  }
}

export async function readExistingEventLog(
  dataDir: string,
  sessionId: string,
): Promise<LogReadResult> {
  const contents = await fs.readFile(logPath(dataDir, sessionId), 'utf8');
  const result = parseLog(contents);
  if (result.records.some((record) => record.sessionId !== sessionId))
    throw new Error(`Event log does not belong to session ${sessionId}.`);
  return result;
}

export class EventLog {
  #tail: Promise<unknown> = Promise.resolve();
  constructor(
    readonly dataDir: string,
    readonly sessionId: string,
  ) {
    logPath(dataDir, sessionId);
  }

  recover(): Promise<void> {
    const operation = this.#tail.then(async () => {
      const path = logPath(this.dataDir, this.sessionId);
      const contents = await fs.readFile(path, 'utf8');
      const read = parseLog(contents);
      if (!read.droppedRecords) return;
      const committed = contents.split('\n').slice(0, read.records.length);
      const file = await fs.open(path, 'r+');
      try {
        await file.truncate(
          Buffer.byteLength(
            committed.length ? committed.join('\n') + '\n' : '',
          ),
        );
        await file.sync();
      } finally {
        await file.close();
      }
    });
    this.#tail = operation.catch(() => undefined);
    return operation;
  }

  commitBeat(
    envelope: Omit<BeatEnvelope, 'sessionId'>,
    drafts: readonly LogDraft[],
    marker: GameEventOf<'BeatCommitted'>['payload'] = {},
  ): Promise<GameEvent[]> {
    if (drafts.some((draft) => draft.type === 'BeatCommitted'))
      return Promise.reject(new Error('BeatCommitted is added by commitBeat.'));
    const records = envelopeDrafts(
      [
        ...drafts,
        {
          type: 'BeatCommitted',
          payload: marker,
          actor: null,
          private: false,
          witnesses: [],
        },
      ],
      { ...envelope, sessionId: this.sessionId },
    );
    const operation = this.#tail.then(() => this.#append(records));
    this.#tail = operation.catch(() => undefined);
    return operation;
  }

  async #append(records: GameEvent[]): Promise<GameEvent[]> {
    const prior = await readEventLog(this.dataDir, this.sessionId);
    if (prior.droppedRecords)
      throw new Error(
        'Cannot append after an uncommitted tail; recover the log first.',
      );
    const first = records[0];
    const last = prior.records.at(-1);
    if (!first || (last && first.beat <= last.beat))
      throw new Error(
        `Beat ${first?.beat ?? '(none)'}: expected a beat newer than the last committed beat ${last?.beat ?? '(none)'}.`,
      );
    await fs.mkdir(join(this.dataDir, 'sessions', this.sessionId), {
      recursive: true,
    });
    const file = await fs.open(logPath(this.dataDir, this.sessionId), 'a');
    const size = (await file.stat()).size;
    try {
      const bytes = Buffer.from(
        records.map((record) => JSON.stringify(record)).join('\n') + '\n',
      );
      const result = await file.write(bytes);
      if (result.bytesWritten !== bytes.length)
        throw new Error(
          `Incomplete beat write: ${result.bytesWritten}/${bytes.length} bytes.`,
        );
      await file.sync();
    } catch (error) {
      // A failed write must not leave a complete-looking marker for a rolled-back beat.
      await file.truncate(size);
      await file.sync();
      throw error;
    } finally {
      await file.close();
    }
    return records;
  }
}
