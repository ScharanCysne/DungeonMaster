import type { EpisodeEnded, GameEvent, ReplayState } from '@dungeon/shared';
import { Engine } from '../engine/index.js';
import type { EngineSnapshot } from '../engine/index.js';
import type { WalkabilityGrid } from '../engine/state.js';
import { readTrace } from '../beat/readTrace.js';
import { readRebuildLog, rebuild } from '../ontology/rebuild.js';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { debugNode } from '../ontology/projectionHelpers.js';
import { PlayerHistory } from '../server/history.js';
import { RequestError } from '../server/wire.js';

interface Checkpoint {
  offset: number;
  engine: EngineSnapshot;
  history: PlayerHistory;
}

export class ReplayArchive {
  readonly #snapshots = new Map<number, Checkpoint>();
  readonly #ends = new Map<number, number>();
  private constructor(
    readonly id: string,
    readonly dataDir: string,
    readonly records: GameEvent[],
    readonly grid: WalkabilityGrid,
    readonly dev: boolean,
  ) {}

  static async open(options: {
    sessionId: string;
    dataDir: string;
    grid: WalkabilityGrid;
    dev: boolean;
    store?: OntologyStore;
  }): Promise<ReplayArchive> {
    const log = await readRebuildLog(options.dataDir, options.sessionId);
    const archive = new ReplayArchive(
      options.sessionId,
      options.dataDir,
      log.records,
      options.grid,
      options.dev,
    );
    await archive.index();
    if (options.store) await rebuild(log, options.store);
    return archive;
  }

  get beats() {
    return this.records.at(-1)?.beat ?? 0;
  }
  get info() {
    return {
      type: 'replay_info' as const,
      sessionId: this.id,
      beats: this.beats,
      ended: this.records.some(({ type }) => type === 'EpisodeEnded'),
    };
  }
  get snapshotBeats() {
    return [...this.#snapshots.keys()];
  }

  private async index() {
    const first = this.records[0];
    if (first?.type !== 'SeedLoaded')
      throw new Error('Replay requires a committed SeedLoaded record.');
    const player = first.payload.seed.characters.find(
      ({ role }) => role === 'player',
    );
    if (!player) throw new Error('Replay seed has no player.');
    const engine = new Engine(
      first.payload.seed,
      this.grid,
      first.payload.rngSeed,
    );
    const history = new PlayerHistory(
      player.id,
      first.payload.seed.mapId,
      this.dev,
      this.grid,
    );
    let offset = 0;
    let expectedBeat = 0;
    for (const [index, record] of this.records.entries()) {
      if (record.type !== 'BeatCommitted') continue;
      if (record.beat !== expectedBeat++)
        throw new Error(
          'Replay requires consecutive committed beats starting at 0.',
        );
      const end = index + 1;
      engine.replay(this.records.slice(offset, end));
      await history.sync(this.records.slice(0, end));
      this.#ends.set(record.beat, end);
      if (record.beat % 10 === 0)
        this.#snapshots.set(record.beat, {
          offset: end,
          engine: engine.snapshot(),
          history: history.clone(),
        });
      offset = end;
    }
  }

  async seek(beat: number) {
    const end = this.#ends.get(beat);
    const snapshotBeat = Math.floor(beat / 10) * 10;
    const checkpoint = this.#snapshots.get(snapshotBeat);
    const first = this.records[0];
    if (
      !Number.isSafeInteger(beat) ||
      end === undefined ||
      !checkpoint ||
      first?.type !== 'SeedLoaded'
    )
      throw new RequestError(
        'BAD_REPLAY_BEAT',
        `Choose a beat from 0 to ${this.beats}.`,
      );
    const engine = new Engine(
      first.payload.seed,
      this.grid,
      first.payload.rngSeed,
    );
    engine.restore(checkpoint.engine);
    const tail = this.records.slice(checkpoint.offset, end);
    engine.replay(tail);
    const history = checkpoint.history.clone();
    await history.sync(this.records.slice(0, end));
    const ended = this.records
      .slice(0, end)
      .findLast((event) => event.type === 'EpisodeEnded');
    let ending: EpisodeEnded | undefined;
    if (ended) {
      const filtered = (await history.perspective()).message({
        type: 'episode_ended',
        beat: ended.beat,
        holder: ended.payload.holder,
        summary: ended.payload.summary,
      });
      if (filtered?.type === 'episode_ended')
        ending = {
          type: 'episode_ended',
          beat: filtered.beat,
          holder: filtered.holder,
          summary: filtered.summary,
        };
    }
    const state: ReplayState = {
      type: 'replay_state',
      snapshot: await history.snapshot(),
      results: history.results,
      ...(ending ? { ended: ending } : {}),
      ...(this.dev
        ? {
            groundTruth: {
              nodes: (await history.store.nodes()).map(debugNode),
              edges: await history.store.edges(),
            },
          }
        : {}),
    };
    return {
      engine,
      history,
      state,
      beat,
      appliedBeats: new Set(tail.map((record) => record.beat)).size,
      trace: (target: number, attempt?: number) => {
        if (target > beat)
          throw new RequestError(
            'TRACE_NOT_FOUND',
            'That beat is ahead of the replay.',
          );
        return readTrace(
          this.dataDir,
          this.id,
          history.player,
          target,
          attempt,
        );
      },
    };
  }
}
export type ReplayCursor = Awaited<ReturnType<ReplayArchive['seek']>>;
