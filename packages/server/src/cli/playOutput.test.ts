import { expect, it } from 'vitest';
import type { BeatResult } from '@dungeon/shared';
import type { MentionEntity } from './playParser.js';
import { createPlayOutput } from './playOutput.js';
import { createStatusRenderer } from './playStatus.js';

const result: BeatResult = {
  type: 'beat_result',
  beat: 1,
  rolls: [],
  traceId: 'beat-1',
  narration: { text: 'You wait.', lines: [] },
  events: [
    {
      v: 1,
      sessionId: 'test',
      beat: 1,
      seq: 1,
      traceId: 'beat-1',
      actor: 'char:kael',
      private: false,
      witnesses: ['char:kael'],
      createdBy: 'engine',
      type: 'AttackResolved',
      payload: {
        attacker: 'char:kael',
        target: 'char:stranger',
        hit: true,
        critical: false,
        roll: {
          expr: '1d20',
          rolls: [17],
          total: 17,
          dc: 13,
          outcome: 'success',
        },
      },
    },
  ],
};

function setup(visibleNames: () => Promise<readonly MentionEntity[]>) {
  const writes: string[] = [];
  const status = createStatusRenderer({
    isTTY: false,
    now: () => 0,
    write: (text) => {
      writes.push(text);
    },
    setInterval: () => {
      throw new Error('Non-TTY output must not tick.');
    },
    clearInterval: () => {
      throw new Error('No timer to clear.');
    },
  });
  const output = createPlayOutput({ status, visibleNames });
  output.remember([{ id: 'char:kael', name: 'Kael' }]);
  return { output, writes };
}

it('refreshes names from the session view after commit and preserves message order', async () => {
  const { output, writes } = setup(() =>
    Promise.resolve([{ id: 'char:stranger', name: 'the stranger' }]),
  );
  output.message({ type: 'beat_started', beat: 1 });
  output.message({
    type: 'beat_progress',
    beat: 1,
    progress: { kind: 'status', phase: 'peers' },
  });
  output.message({
    type: 'beat_progress',
    beat: 1,
    progress: { kind: 'peer_line', speaker: 'char:ilsa', text: 'Listen.' },
  });
  output.message({
    type: 'beat_progress',
    beat: 1,
    progress: { kind: 'status', phase: 'dm' },
  });
  output.message(result);
  output.message({
    type: 'paused',
    beat: 2,
    attempt: 0,
    reason: 'budget',
    retryInMs: null,
  });
  await output.flush();
  expect(writes.slice(0, 6)).toEqual([
    "\nBeat 1: The Dungeon Master's quill scratches…\n",
    'A peer is speaking…\n',
    '(provisional) char:ilsa: Listen.\n',
    'DM is resolving…\n',
    'Kael attacks the stranger · 17 vs AC 13 → hit\n',
    'You wait.\n',
  ]);
  expect(writes[6]).toMatch(/^Paused: budget/);
});

it('uses remembered names and id fallback if projection is unavailable', async () => {
  const { output, writes } = setup(() =>
    Promise.reject(new Error('Graph unavailable.')),
  );
  output.message(result);
  await output.flush();
  expect(writes).toEqual([
    'Kael attacks char:stranger · 17 vs AC 13 → hit\n',
    'You wait.\n',
  ]);
});

it('does not query names for provisional feedback', async () => {
  let reads = 0;
  const { output, writes } = setup(() => {
    reads++;
    return Promise.resolve([]);
  });
  output.message({ type: 'beat_started', beat: 1 });
  output.message({
    type: 'beat_progress',
    beat: 1,
    progress: { kind: 'status', phase: 'dm' },
  });
  await output.flush();
  expect(reads).toBe(0);
  expect(writes).toHaveLength(2);
});
