import { toolSchemas } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { envelopeDrafts } from '../../ontology/eventLog.js';
import { graphSnapshot } from '../../ontology/testing/fixtures.js';
import { executeToolCall } from './execute.js';
import { fixture, newFact, rejects, sharing } from './testing/fixtures.js';

it('creates unique DM facts and learning drafts, including supersedes and pending knowledge retraction', async () => {
  const { ctx, store } = await fixture();
  const graph = await graphSnapshot(store);
  const first = await executeToolCall(
    'create_fact',
    {
      ...newFact,
      knownBy: ['char:seller', 'char:player'],
      supersedes: 'fact:rumour',
    },
    ctx,
  );
  expect(first).toMatchObject({
    ok: true,
    value: { factId: 'fact:the-moon-is-painted' },
  });
  expect(ctx.events.map((draft) => draft.type)).toEqual([
    'FactCreated',
    'FactLearned',
    'FactLearned',
  ]);
  for (const draft of ctx.events)
    expect(draft).toMatchObject({
      createdBy: 'dm',
      witnesses: ['char:seller', 'char:player'],
    });
  expect(ctx.events[0]).toMatchObject({
    payload: {
      supersedes: 'fact:rumour',
      fact: { createdBy: 'dm', createdAtBeat: 1 },
    },
  });
  expect(
    (
      await executeToolCall(
        'share_fact',
        { ...sharing, factId: 'fact:the-moon-is-painted' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  await rejects(ctx, 'share_fact', sharing, 'FACT_NOT_KNOWN');
  expect(await executeToolCall('create_fact', newFact, ctx)).toMatchObject({
    ok: true,
    value: { factId: 'fact:the-moon-is-painted-2' },
  });
  expect(
    (
      await executeToolCall(
        'create_fact',
        { ...newFact, supersedes: 'fact:the-moon-is-painted' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  expect(await graphSnapshot(store)).toEqual(graph);
  const records = envelopeDrafts(ctx.events, {
    sessionId: 'session',
    beat: 1,
    createdBy: 'engine',
    traceId: 'trace',
  });
  expect(records[0]?.createdBy).toBe('dm');
  expect(records[3]?.createdBy).toBe('engine');
});

it.each([
  [{ ...newFact, about: ['item:quest'] }, 'QUEST_FACT_PROTECTED', 'item:quest'],
  [{ ...newFact, about: ['loc:missing'] }, 'NO_SUCH_ENTITY', 'loc:missing'],
  [
    { ...newFact, knownBy: ['char:player', 'char:missing'] },
    'NO_SUCH_ENTITY',
    'char:missing',
  ],
  [
    { ...newFact, supersedes: 'fact:missing' },
    'NO_SUCH_ENTITY',
    'fact:missing',
  ],
  [{ ...newFact, kind: 'secret' }, 'INVALID_INPUT', 'kind'],
  [{ ...newFact, kind: 'backstory' }, 'INVALID_INPUT', 'kind'],
])(
  'rejects protected or invalid fact creation %#',
  async (input, code, field) => {
    const { ctx } = await fixture();
    await rejects(ctx, 'create_fact', input, code, field);
  },
);

it('updates personal quests with the pursuer as witness and retains the draft in pending state', async () => {
  const { ctx } = await fixture();
  const result = await executeToolCall(
    'set_quest_status',
    { quest: 'quest:personal', status: 'complete' },
    ctx,
  );
  expect(result).toMatchObject({
    ok: true,
    value: { questId: 'quest:personal', status: 'complete' },
    events: [{ witnesses: ['char:peer'], createdBy: 'engine' }],
  });
  if (result.ok)
    expect(toolSchemas.set_quest_status.output.parse(result.value)).toEqual(
      result.value,
    );
  expect(
    await (await ctx.softState()).getNode('quest:personal'),
  ).toHaveProperty('status', 'complete');
  expect(await ctx.store.getNode('quest:personal')).toHaveProperty(
    'status',
    'active',
  );
});

it.each([
  ['quest:episode', 'QUEST_PROTECTED'],
  ['quest:missing', 'NO_SUCH_ENTITY'],
])('rejects changing %s', async (quest, code) => {
  const { ctx } = await fixture();
  await rejects(
    ctx,
    'set_quest_status',
    { quest, status: 'complete' },
    code,
    quest,
  );
});

it('refuses a personal quest without a pursuer', async () => {
  const { ctx, store } = await fixture();
  await store.apply([
    {
      type: 'removeEdges',
      filter: { types: ['PURSUES'], to: 'quest:personal' },
    },
  ]);
  await rejects(
    ctx,
    'set_quest_status',
    { quest: 'quest:personal', status: 'complete' },
    'QUEST_PURSUER_MISSING',
  );
});
