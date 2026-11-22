import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as storage from './sessionStorage.js';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import { Engine } from '../engine/index.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { verify } from '../ontology/verify.js';
import { Session } from './Session.js';
import {
  accepted,
  calls,
  content,
  harness,
  narrate,
  pass,
  playerIntent,
  script,
} from './testing/harness.js';

it('generates the ten-beat recap from committed events and commits it in beat eleven', async () => {
  const provider = script(11);
  provider.enqueue('recap', {
    type: 'structured',
    output: { text: 'The party has listened carefully for ten beats.' },
  });
  const { session, store, settings } = await harness({ provider });
  for (let beat = 0; beat < 10; beat++)
    await session.submitIntent(playerIntent());
  expect(session.records.some(({ type }) => type === 'RecapUpdated')).toBe(
    false,
  );
  await session.submitIntent(playerIntent());
  const recaps = provider.requests.filter(({ role }) => role === 'recap');
  expect(recaps).toHaveLength(1);
  expect(recaps[0]?.messages[0]?.content).toBe(
    JSON.stringify(
      session.records.filter(
        ({ type, beat }) =>
          beat <= 10 &&
          ![
            'SeedLoaded',
            'RecapUpdated',
            'BeatStarted',
            'BeatCommitted',
          ].includes(type),
      ),
    ),
  );
  expect(
    session.records.find(({ type }) => type === 'RecapUpdated'),
  ).toMatchObject({ beat: 11, payload: { text: session.recap } });
  expect(
    provider.requests
      .findLast(({ role }) => role === 'dm')
      ?.system.some(({ text }) => text.includes(session.recap ?? 'missing')),
  ).toBe(true);
  const fresh = new MemoryStore();
  const resumed = await Session.resume(session.id, {
    ...settings,
    store: fresh,
  });
  expect(resumed.engine.state).toEqual(
    Engine.fromLog(session.records, content.grid).state,
  );
  expect(resumed.rotation).toEqual(session.rotation);
  expect(resumed.recap).toBe(session.recap);
  expect(resumed.beat).toBe(11);
  expect(await fresh.nodes()).toEqual(await store.nodes());
  expect(await fresh.edges()).toEqual(await store.edges());
  expect(await verify(resumed.engine.state, fresh)).toEqual([]);
  provider.assertDrained();
});

afterEach(() => {
  vi.restoreAllMocks();
});
it.each([false, true])(
  'ends when Ilsa takes the quill outside player sight (summary failure: %s)',
  async (failSummary) => {
    const actor = 'char:ilsa';
    const checkInput = {
      actor,
      skill: 'investigation',
      dc: 15,
      advantage: 'advantage',
      reason: 'Find the old barrel.',
    } as const;
    let sessionSeed = '';
    for (let index = 0; index < 100; index++) {
      const candidate = `peer-quill-${index}`;
      const engine = new Engine(content.seed, content.grid, candidate);
      engine.beginBeat(1);
      const check = engine.skill_check(checkInput);
      if (check.ok && check.value.outcome === 'success') {
        sessionSeed = candidate;
        break;
      }
    }
    expect(sessionSeed).not.toBe('');
    const provider = new ScriptedProvider({
      peer: [
        pass,
        {
          type: 'structured',
          output: {
            kind: 'intent',
            text: 'Find the quill.',
            refs: [],
            private: true,
          },
        },
      ],
      dm: [
        calls(
          { name: 'move', input: { actor, to: 'char:brann' } },
          {
            name: 'transfer_item',
            input: {
              actor,
              item: 'item:iron-key',
              to: actor,
              reason: 'buy',
              price: 0,
            },
          },
          { name: 'move', input: { actor, to: 'loc:kitchen' } },
          { name: 'skill_check', input: checkInput },
          {
            name: 'search',
            input: { actor, area: 'loc:kitchen', checkId: 'chk_1_1' },
          },
          {
            name: 'unlock_container',
            input: {
              actor,
              container: 'container:old-barrel',
              method: 'key',
              itemId: 'item:iron-key',
            },
          },
          {
            name: 'open_container',
            input: { actor, container: 'container:old-barrel' },
          },
          {
            name: 'transfer_item',
            input: { actor, item: 'item:quill', to: actor, reason: 'pick_up' },
          },
          narrate,
        ),
      ],
      critic: [accepted],
    });
    const { session, store, dataDir } = await harness({
      provider,
      sessionSeed,
    });
    if (failSummary)
      vi.spyOn(storage, 'writeSummary').mockRejectedValueOnce(
        new Error('Summary disk failure.'),
      );
    const result = await session.submitIntent(playerIntent());
    expect(result?.ended).toMatchObject({
      type: 'episode_ended',
      holder: actor,
    });
    expect(session.state).toEqual({ status: 'ended' });
    expect(session.records.slice(-3).map(({ type }) => type)).toEqual([
      'EpisodeEnded',
      'NarrationCommitted',
      'BeatCommitted',
    ]);
    // The key changes hands at the bar, in view; the quill is taken unseen in the kitchen.
    expect(
      result?.result.events.some(
        (event) =>
          event.type === 'ItemTransferred' &&
          event.payload.itemId === 'item:quill',
      ),
    ).toBe(false);
    expect(result?.result.rolls).toEqual([]);
    expect(await verify(session.engine.state, store)).toEqual([]);
    if (!failSummary) {
      const summary: unknown = JSON.parse(
        await readFile(
          join(dataDir, 'sessions', session.id, 'summary.json'),
          'utf8',
        ),
      );
      expect(summary).toMatchObject({
        beats: 1,
        holder: actor,
        costUsd: 0,
        toolErrorRate: 0,
      });
    }
    await expect(session.submitIntent(playerIntent())).rejects.toThrow(
      'EPISODE_ENDED',
    );
    provider.assertDrained();
  },
);

it('records critic rejection and fallback statistics on quit', async () => {
  const rejected = {
    type: 'structured',
    output: {
      claims: [],
      selfLeaks: [],
      verdict: {
        ok: false,
        issues: [
          {
            type: 'unbacked_outcome',
            quote: 'listen',
            explanation: 'Test rejection.',
          },
        ],
      },
    },
  } as const;
  const provider = new ScriptedProvider({
    peer: [pass, pass],
    dm: [calls(narrate), calls(narrate)],
    critic: [rejected, rejected],
  });
  const { session, dataDir } = await harness({ provider });
  const result = await session.submitIntent(playerIntent());
  expect(result?.result.narration.text).toBe('You notice no further change.');
  await session.command({ type: 'session_command', command: 'save_and_quit' });
  const summary: unknown = JSON.parse(
    await readFile(
      join(dataDir, 'sessions', session.id, 'summary.json'),
      'utf8',
    ),
  );
  expect(summary).toMatchObject({
    beats: 1,
    holder: null,
    criticRejections: 2,
    criticFallbacks: 1,
    leakCount: 0,
  });
});
