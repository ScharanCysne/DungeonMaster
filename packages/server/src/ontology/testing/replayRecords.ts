import type { GameEvent } from '@dungeon/shared';
import { Engine } from '../../engine/index.js';
import { gridFixture } from '../../engine/testing/fixtures.js';
import { envelopeDrafts } from '../eventLog.js';
import type { LogDraft } from '../eventLog.js';
import { ontologySeed, seedRecord } from './fixtures.js';
import { scriptedBeats } from './session.js';

export function replayRecords(): GameEvent[] {
  const seed = ontologySeed();
  const engine = new Engine(seed, gridFixture(), 'fixture');
  const committed: LogDraft = {
    type: 'BeatCommitted',
    payload: {},
    actor: null,
    private: false,
    witnesses: [],
  };
  const records = envelopeDrafts([seedRecord(seed), committed], {
    sessionId: 'session',
    beat: 0,
    createdBy: 'seed',
    traceId: 'seed',
  });
  for (const [index, play] of scriptedBeats.entries()) {
    const beat = index + 1;
    engine.beginBeat(beat);
    play(engine);
    records.push(
      ...envelopeDrafts(
        [
          {
            type: 'BeatStarted',
            payload: { attempt: 0 },
            actor: null,
            private: false,
            witnesses: [],
          },
          ...engine.collectEvents(),
          committed,
        ],
        {
          sessionId: 'session',
          beat,
          createdBy: 'engine',
          traceId: `beat-${beat}`,
        },
      ),
    );
  }
  return records;
}
