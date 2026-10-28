import { expect, it } from 'vitest';
import type { CharacterId, EpisodeSeed } from '@dungeon/shared';
import { createDmBeat } from '../dm/index.js';
import { call, finish, turn } from '../dm/testing.js';
import { ScriptedProvider } from '../llm/ScriptedProvider.js';
import { BeatContext } from '../tools/BeatContext.js';
import { fixture } from '../tools/testing/fixtures.js';
import { reviewBeat } from './review.js';
import { checkNarration } from './check.js';
import { learnSelfLeaks } from './selfLeak.js';
import { reject, verdict } from './testing.js';
import { ontologySeed } from '../../ontology/testing/fixtures.js';

const text = 'The peer hid a ruby beneath the east stair.';
const leak = {
  speaker: 'char:peer' as const,
  factId: 'fact:secret' as const,
  quote: text,
};
const narration = {
  text: 'You listen.',
  lines: [{ speaker: leak.speaker, text }],
};

async function setup(edit?: (seed: EpisodeSeed) => void) {
  const seed = ontologySeed();
  edit?.(seed);
  const { ctx: base } = await fixture(edit ? { edit } : {});
  const ctx = new BeatContext({
    engine: base.engine,
    store: base.store,
    generators: base.generators,
    npcVoice: base.npcVoice,
    peerSayLines: narration.lines,
  });
  const provider = new ScriptedProvider({
    dm: [turn(call('narrate', narration))],
  });
  const intents = { player: { selection: [], text: 'I listen.' }, peers: [] };
  const dm = await createDmBeat({ provider, ctx, seed, intents });
  return { ctx, provider, dm, intents };
}

it('accepts peer self-disclosure, learns only for witnesses and flags the trace', async () => {
  const f = await setup();
  f.provider.enqueue('critic', verdict({ selfLeaks: [leak] }));
  const result = await reviewBeat({ ...f, result: await f.dm.run() });
  expect(result.fallback).toBe(false);
  expect(result.verdicts).toEqual([{ ok: true }]);
  expect(result.flags.selfLeaks).toHaveLength(1);
  const flag = result.flags.selfLeaks[0];
  expect(flag?.witnesses).toContain('char:player');
  const learned = f.ctx.events.filter((event) => event.type === 'FactLearned');
  expect(learned.map(({ payload }) => payload.characterId)).not.toContain(
    'char:peer',
  );
  expect(learned).toContainEqual(
    expect.objectContaining({
      actor: 'char:peer',
      payload: {
        characterId: 'char:player',
        factId: 'fact:secret',
        source: 'told',
        confidence: 1,
        since: 1,
      },
    }),
  );
  for (const event of learned)
    expect(flag?.witnesses).toContain(event.payload.characterId);
  expect(
    await f.ctx.store.edges({
      types: ['KNOWS'],
      from: 'char:player',
      to: 'fact:secret',
    }),
  ).toEqual([]);
  expect(
    await (
      await f.ctx.softState()
    ).edges({ types: ['KNOWS'], from: 'char:player', to: 'fact:secret' }),
  ).toHaveLength(1);
  const before = f.ctx.events;
  await learnSelfLeaks(f.ctx, [leak]);
  expect(f.ctx.events).toEqual(before);
});

it('does not reject a knowledge issue that is exactly a validated peer self-leak', async () => {
  const f = await setup();
  f.provider.enqueue(
    'critic',
    verdict({
      selfLeaks: [leak],
      verdict: {
        ok: false,
        issues: [
          {
            type: 'perspective_leak',
            quote: text,
            explanation: 'The player did not know this secret.',
          },
        ],
      },
    }),
  );
  expect(
    (await reviewBeat({ ...f, result: await f.dm.run() })).verdicts,
  ).toEqual([{ ok: true }]);
});

it('never teaches from a rejected proposal or its omitted retry dialogue', async () => {
  const f = await setup();
  f.provider.enqueue('dm', finish);
  f.provider.enqueue(
    'critic',
    {
      type: 'structured',
      output: {
        claims: [],
        verdict: {
          ok: false,
          issues: [
            {
              type: 'invented_content',
              quote: text,
              explanation: 'Additional detail is invented.',
            },
          ],
        },
        selfLeaks: [leak],
      },
    },
    verdict(),
  );
  const result = await reviewBeat({ ...f, result: await f.dm.run() });
  expect(result.flags.selfLeaks).toEqual([]);
  expect(f.ctx.events).toEqual([]);
});

it('never teaches from two rejected proposals', async () => {
  const f = await setup();
  f.provider.enqueue('dm', turn(call('narrate', narration)));
  f.provider.enqueue('critic', reject, reject);
  expect((await reviewBeat({ ...f, result: await f.dm.run() })).fallback).toBe(
    true,
  );
  expect(f.ctx.events).toEqual([]);
});

it.each([
  { ...leak, factId: 'fact:unknown' as const },
  { ...leak, quote: 'Words never spoken.' },
  { ...leak, speaker: 'char:seller' as const },
])('ignores fabricated self-leak annotations: %j', async (invalid) => {
  const f = await setup();
  f.provider.enqueue('critic', verdict({ selfLeaks: [invalid] }));
  const result = await reviewBeat({ ...f, result: await f.dm.run() });
  expect(result.flags.selfLeaks).toEqual([]);
  expect(f.ctx.events).toEqual([]);
});

it.each(['HAS_SECRET', 'KNOWS'] as const)(
  'requires the peer to have %s',
  async (type) => {
    const f = await setup();
    await f.ctx.store.apply([
      {
        type: 'removeEdges',
        filter: { types: [type], from: 'char:peer', to: 'fact:secret' },
      },
    ]);
    f.provider.enqueue('critic', verdict({ selfLeaks: [leak] }));
    expect(
      (await reviewBeat({ ...f, result: await f.dm.run() })).flags.selfLeaks,
    ).toEqual([]);
  },
);

it('excludes unconscious and distant listeners', async () => {
  const f = await setup((seed) => {
    const seller = seed.characters.find(({ id }) => id === 'char:seller');
    if (!seller) throw new Error('Missing seller');
    seller.conscious = false;
    const peer = seed.characters.find(({ id }) => id === 'char:peer');
    if (!peer) throw new Error('Missing peer');
    seed.characters.push({
      ...peer,
      id: 'char:away',
      location: 'loc:other',
      tile: { x: 6, y: 1 },
    });
  });
  f.provider.enqueue('critic', verdict({ selfLeaks: [leak] }));
  const result = await reviewBeat({ ...f, result: await f.dm.run() });
  expect(result.flags.selfLeaks[0]?.witnesses).not.toContain('char:seller');
  expect(result.flags.selfLeaks[0]?.witnesses).not.toContain('char:away');
});

it('uses the engine dark-room perception rule for public speech', async () => {
  const f = await setup((seed) => {
    const room = seed.locations.find(({ id }) => id === 'loc:room');
    if (!room) throw new Error('Missing room');
    room.lit = false;
    for (const character of seed.characters) character.tags = [];
  });
  const flags = await learnSelfLeaks(f.ctx, [leak]);
  expect(flags[0]?.witnesses).toEqual(['char:peer']);
});

it('allows a disclosed own secret to name its hidden subject without accepting narrator leaks', async () => {
  const f = await setup((seed) => {
    const hidden = seed.containers.find(({ hidden }) => hidden);
    const secret = seed.facts.find(({ id }) => id === 'fact:secret');
    if (!hidden || !secret) throw new Error('Missing hidden subject');
    hidden.name = 'ruby';
    secret.about.push(hidden.id);
  });
  f.provider.enqueue('critic', verdict({ selfLeaks: [leak] }));
  const result = await reviewBeat({ ...f, result: await f.dm.run() });
  expect(result.verdicts).toEqual([{ ok: true }]);
  expect(result.checks[0]?.precheck.issues).toMatchObject([
    { type: 'perspective_leak' },
  ]);
});

it('records every witness with the same soft-event witness set', async () => {
  const f = await setup();
  const flags = await learnSelfLeaks(f.ctx, [leak, leak]);
  const learnerIds: CharacterId[] = f.ctx.events.flatMap((event) =>
    event.type === 'FactLearned' ? [event.payload.characterId] : [],
  );
  expect(new Set(learnerIds).size).toBe(learnerIds.length);
  for (const event of f.ctx.events)
    expect(event.witnesses).toEqual(flags[0]?.witnesses);
});

it('does not waive an identical NPC claim under a peer disclosure exception', async () => {
  const f = await setup();
  f.ctx.voicedLines.set('npc', { speaker: 'char:seller', text });
  f.provider.enqueue(
    'critic',
    verdict({
      selfLeaks: [leak],
      verdict: {
        ok: false,
        issues: [
          {
            type: 'npc_knowledge_leak',
            quote: text,
            explanation: 'The seller does not know this secret.',
          },
        ],
      },
    }),
  );
  const result = await checkNarration(
    f,
    f.ctx,
    {
      ...narration,
      lines: [
        ...narration.lines,
        { speaker: 'char:seller', text, lineId: 'npc' },
      ],
    },
    [],
    f.intents,
  );
  expect(result.verdict).toMatchObject({
    ok: false,
    issues: [{ type: 'npc_knowledge_leak' }],
  });
});

it('does not waive the same hidden subject in narrator prose', async () => {
  const f = await setup((seed) => {
    const hidden = seed.containers.find(({ hidden }) => hidden);
    const secret = seed.facts.find(({ id }) => id === 'fact:secret');
    if (!hidden || !secret) throw new Error('Missing hidden subject');
    hidden.name = 'ruby';
    secret.about.push(hidden.id);
  });
  f.provider.enqueue('critic', verdict({ selfLeaks: [leak] }));
  const result = await checkNarration(
    f,
    f.ctx,
    { ...narration, text: 'You see the ruby.' },
    [],
    f.intents,
  );
  expect(result.verdict).toMatchObject({
    ok: false,
    issues: [{ type: 'perspective_leak', quote: 'You see the ruby.' }],
  });
});
