import { expect, it } from 'vitest';
import type { ServerMessage } from '@dungeon/shared';
import { createStatusRenderer, statusText } from './playStatus.js';
import type { PlayStatus } from './playStatus.js';

const clear = '\r\u001b[2K';
const started: ServerMessage = { type: 'beat_started', beat: 1 };
const progress = (
  phase: PlayStatus['phase'],
  toolCalls?: number,
): ServerMessage => ({
  type: 'beat_progress',
  beat: 1,
  progress: {
    kind: 'status',
    phase,
    ...(toolCalls === undefined ? {} : { toolCalls }),
  },
});

function setup(isTTY: boolean) {
  let now = 0;
  let nextId = 0;
  const writes: string[] = [];
  const tasks = new Map<number, () => void>();
  const renderer = createStatusRenderer({
    isTTY,
    now: () => now,
    write: (text) => {
      writes.push(text);
    },
    setInterval: (tick, ms) => {
      expect(ms).toBe(1000);
      const id = nextId++;
      tasks.set(id, tick);
      return id;
    },
    clearInterval: (id) => {
      tasks.delete(id);
    },
  });
  return {
    renderer,
    writes,
    tasks,
    tick: (ms: number) => {
      now += ms;
      for (const task of tasks.values()) task();
    },
  };
}

it.each([
  ['peers', 'A peer is speaking…'],
  ['dm', 'DM is resolving…'],
  ['npc_voice', 'An NPC is finding their words…'],
  ['critic', 'Checking the narration…'],
  ['dm_retry', 'DM is revising…'],
  ['committing', 'Saving the beat…'],
] as const)('formats %s without implying an outcome', (phase, label) => {
  expect(statusText({ kind: 'status', phase })).toBe(label);
  expect(statusText({ kind: 'status', phase }, 34)).toBe(`${label} 34s`);
});

it.each([
  [0, 'actions'],
  [1, 'action'],
  [3, 'actions'],
] as const)('formats %s completed tools', (toolCalls, noun) => {
  expect(statusText({ kind: 'status', phase: 'dm', toolCalls }, 18.9)).toBe(
    `DM is resolving… ${toolCalls} ${noun} · 18s`,
  );
});

it('clamps a negative elapsed clock to zero', () => {
  expect(statusText({ kind: 'status', phase: 'dm' }, -1)).toBe(
    'DM is resolving… 0s',
  );
});

it('prints only phase transitions in non-TTY output, with no timer or escapes', () => {
  const { renderer, writes, tasks, tick } = setup(false);
  renderer.message(started);
  renderer.message(progress('peers'));
  renderer.message(progress('peers'));
  renderer.message(progress('dm'));
  renderer.message(progress('dm', 1));
  renderer.message(progress('dm', 2));
  renderer.write('(provisional) Ilsa: Listen.');
  tick(18000);
  renderer.message(progress('npc_voice', 2));
  renderer.message(progress('dm', 3));
  renderer.message(progress('critic', 3));
  renderer.message(progress('committing', 3));
  renderer.stop();
  expect(tasks.size).toBe(0);
  expect(writes).toEqual([
    'A peer is speaking…\n',
    'DM is resolving…\n',
    '(provisional) Ilsa: Listen.\n',
    'An NPC is finding their words…\n',
    'DM is resolving…\n',
    'Checking the narration…\n',
    'Saving the beat…\n',
  ]);
});

it('updates one TTY line with total beat elapsed time across phases', () => {
  const { renderer, writes, tasks, tick } = setup(true);
  renderer.message(started);
  renderer.message(progress('peers'));
  tick(18000);
  renderer.message(progress('dm', 3));
  tick(16000);
  renderer.message(progress('critic'));
  expect(tasks.size).toBe(1);
  expect(writes).toEqual([
    `${clear}A peer is speaking… 0s`,
    `${clear}A peer is speaking… 18s`,
    `${clear}DM is resolving… 3 actions · 18s`,
    `${clear}DM is resolving… 3 actions · 34s`,
    `${clear}Checking the narration… 34s`,
  ]);
});

it('clears before ordinary output and redraws while running', () => {
  const { renderer, writes } = setup(true);
  renderer.message(started);
  renderer.message(progress('peers'));
  renderer.write('(provisional) Ilsa: Listen.');
  expect(writes.slice(-3)).toEqual([
    clear,
    '(provisional) Ilsa: Listen.\n',
    `${clear}A peer is speaking… 0s`,
  ]);
  renderer.stop();
  renderer.write('Kael · Investigation 14 vs DC 10 → success');
  renderer.write('A clue appears.');
  expect(writes.slice(-3)).toEqual([
    clear,
    'Kael · Investigation 14 vs DC 10 → success\n',
    'A clue appears.\n',
  ]);
});

const endings: ServerMessage[] = [
  {
    type: 'beat_result',
    beat: 1,
    events: [],
    rolls: [],
    narration: { text: 'Done.', lines: [] },
    traceId: 'beat-1',
  },
  {
    type: 'paused',
    beat: 1,
    reason: 'llm_unavailable',
    attempt: 0,
    retryInMs: null,
  },
  { type: 'error', code: 'FAILED', message: 'Failed.' },
  { type: 'episode_ended', beat: 1, holder: 'char:kael', summary: 'Done.' },
];
it.each(endings)('cleans up on $type and ignores late progress', (message) => {
  const { renderer, writes, tasks, tick } = setup(true);
  renderer.message(started);
  renderer.message(progress('dm'));
  renderer.message(message);
  expect(writes.at(-1)).toBe(clear);
  expect(tasks.size).toBe(0);
  const before = [...writes];
  tick(1000);
  renderer.message(progress('dm', 4));
  renderer.stop();
  expect(writes).toEqual(before);
});

it('resets elapsed time and replaces the timer when a new attempt starts', () => {
  const { renderer, writes, tasks, tick } = setup(true);
  renderer.message(started);
  renderer.message(progress('dm'));
  tick(10000);
  renderer.message(started);
  renderer.message(progress('peers'));
  expect(tasks.size).toBe(1);
  expect(writes.at(-1)).toBe(`${clear}A peer is speaking… 0s`);
  renderer.stop();
  expect(tasks.size).toBe(0);
});

it('does not draw before a status or start a ticker for stray progress', () => {
  const { renderer, tasks, writes, tick } = setup(true);
  renderer.message(progress('dm'));
  expect(tasks.size).toBe(0);
  renderer.message(started);
  tick(1000);
  renderer.write('Beat 1');
  renderer.stop();
  expect(writes).toEqual(['Beat 1\n']);
});
