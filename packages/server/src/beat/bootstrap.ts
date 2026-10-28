import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { configSchema } from '@dungeon/shared';
import type {
  Config,
  GameEvent,
  PauseReason,
  ServerMessage,
} from '@dungeon/shared';
import type { LlmProvider } from '../agents/llm/types.js';
import { loadEpisode } from '../content/index.js';
import { Engine } from '../engine/index.js';
import {
  EventLog,
  readEventLog,
  readExistingEventLog,
} from '../ontology/eventLog.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { rebuild } from '../ontology/rebuild.js';
import { systemClock } from './Clock.js';
import type { Clock } from './Clock.js';
import type { EpisodeContent } from './types.js';
import { readBudget } from './sessionStorage.js';
import { readTraceTotals } from './traces.js';

export interface SessionOptions {
  provider: LlmProvider;
  content?: EpisodeContent;
  store?: OntologyStore;
  config?: Config;
  clock?: Clock;
  dataDir?: string;
  sessionId?: string;
  sessionSeed?: string;
  onMessage?: (message: ServerMessage) => void;
  healthCheck?: (reason: PauseReason) => Promise<boolean>;
}

export async function bootstrap(options: SessionOptions, resumeId?: string) {
  const clock = options.clock ?? systemClock;
  const sessionId =
    resumeId ??
    options.sessionId ??
    `${new Date(clock.now()).toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const dataDir = options.dataDir ?? resolve('data');
  const content = options.content ?? (await loadEpisode());
  if (content.problems.length) throw new Error(content.problems.join('; '));
  const store = options.store ?? new MemoryStore();
  const config = configSchema.parse(options.config ?? {});
  const log = new EventLog(dataDir, sessionId);
  let records: GameEvent[];
  let engine: Engine;
  if (resumeId) {
    const read = await readExistingEventLog(dataDir, sessionId);
    records = read.records;
    engine = Engine.fromLog(records, content.grid);
    await log.recover();
    await rebuild(read, store);
  } else {
    if ((await readEventLog(dataDir, sessionId)).records.length)
      throw new Error(
        `Session ${sessionId} already exists; resume it instead.`,
      );
    const rngSeed = options.sessionSeed ?? sessionId;
    engine = new Engine(content.seed, content.grid, rngSeed);
    records = await log.commitBeat(
      { beat: 0, traceId: 'seed', createdBy: 'seed' },
      [
        {
          type: 'SeedLoaded',
          payload: { seed: content.seed, rngSeed },
          actor: null,
          private: false,
          witnesses: [],
        },
      ],
    );
    await rebuild({ records, droppedRecords: 0 }, store);
  }
  const seedRecord = records.find((record) => record.type === 'SeedLoaded');
  if (!seedRecord) throw new Error('Missing SeedLoaded record.');
  const player = seedRecord.payload.seed.characters.find(
    ({ role }) => role === 'player',
  );
  if (!player) throw new Error('Missing player character.');
  return {
    clock,
    sessionId,
    dataDir,
    content: { ...content, seed: seedRecord.payload.seed },
    store,
    config,
    log,
    engine,
    records,
    player: player.id,
    totals: await readTraceTotals(dataDir, sessionId),
    budget: resumeId
      ? await readBudget(dataDir, sessionId, config.budget.sessionUsd)
      : config.budget.sessionUsd,
  };
}
export type Bootstrap = Awaited<ReturnType<typeof bootstrap>>;
