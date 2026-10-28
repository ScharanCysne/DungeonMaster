import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { ScriptedProvider } from '../../agents/llm/ScriptedProvider.js';
import type { ScriptedReply } from '../../agents/llm/ScriptedProvider.js';
import { loadEpisode } from '../../content/index.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { Session } from '../Session.js';
import type { SessionOptions } from '../bootstrap.js';
import type { Clock } from '../Clock.js';

export const content = await loadEpisode();
export const intent = {
  type: 'player_intent',
  selection: [],
  text: 'I listen.',
} as const;
export const playerIntent = () => ({ ...intent, selection: [] });
export const narration = {
  text: 'You listen to the murmur of the room.',
  lines: [],
};
export const accepted: ScriptedReply = {
  type: 'structured',
  output: { claims: [], verdict: { ok: true }, selfLeaks: [] },
};
export const pass: ScriptedReply = {
  type: 'structured',
  output: { kind: 'pass' },
};
export function calls(
  ...tools: { name: string; input: unknown }[]
): ScriptedReply {
  return {
    type: 'tool_use',
    content: tools.map(({ name, input }, index) => ({
      type: 'tool_use',
      id: `call-${index}`,
      name,
      input,
    })),
  };
}
export const narrate = { name: 'narrate', input: narration };
export const check = {
  name: 'skill_check',
  input: {
    actor: 'char:kael',
    skill: 'perception',
    dc: 10,
    advantage: 'none',
    reason: 'Listen for a clue.',
  },
};
export function script(beats = 1) {
  return new ScriptedProvider({
    peer: Array.from({ length: beats * 2 }, () => pass),
    dm: Array.from({ length: beats }, () => calls(narrate)),
    critic: Array.from({ length: beats }, () => accepted),
  });
}

export class FakeClock implements Clock {
  time = 0;
  tasks = new Map<number, { at: number; task: () => void | Promise<void> }>();
  #id = 0;
  now() {
    return this.time;
  }
  schedule(delay: number, task: () => void | Promise<void>) {
    const id = ++this.#id;
    this.tasks.set(id, { at: this.time + delay, task });
    return () => {
      this.tasks.delete(id);
    };
  }
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    for (;;) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      await next[1].task();
    }
    this.time = target;
  }
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
export async function harness(options: Partial<SessionOptions> = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dungeon-beat-'));
  directories.push(dataDir);
  const provider = options.provider ?? script();
  const clock = new FakeClock();
  const store = options.store ?? new MemoryStore();
  const settings = {
    dataDir,
    content,
    clock,
    store,
    provider,
    sessionId: 'test-session',
    sessionSeed: 'golden',
    ...options,
  };
  const session = await Session.start(settings);
  return { session, provider, clock, store, settings, dataDir };
}
export async function traceFile(
  dataDir: string,
  beat = 1,
  attempt = 0,
): Promise<unknown> {
  return JSON.parse(
    await readFile(
      join(
        dataDir,
        'sessions',
        'test-session',
        'traces',
        `beat-${beat}-${attempt}.json`,
      ),
      'utf8',
    ),
  );
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
