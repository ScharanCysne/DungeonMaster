import { configSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { graphSnapshot } from '../../ontology/testing/fixtures.js';
import { executeToolCall } from './execute.js';
import { attitude, fixture, rejects, sharing } from './testing/fixtures.js';

it('accumulates attitude changes in pending state, clamping both ends without touching the store', async () => {
  const { ctx, store } = await fixture({
    edit(seed) {
      const edge = seed.attitudes[0];
      if (edge) edge.value = 90;
    },
  });
  const graph = await graphSnapshot(store);
  const first = await executeToolCall('set_attitude', attitude, ctx);
  expect(first).toMatchObject({ ok: true, value: { ...attitude, value: 100 } });
  expect(
    await executeToolCall('set_attitude', { ...attitude, delta: -30 }, ctx),
  ).toMatchObject({ ok: true, value: { value: 70 } });
  expect(await graphSnapshot(store)).toEqual(graph);
  const negative = await fixture({
    edit(seed) {
      const edge = seed.attitudes[0];
      if (edge) edge.value = -90;
    },
  });
  expect(
    await executeToolCall(
      'set_attitude',
      { ...attitude, delta: -30 },
      negative.ctx,
    ),
  ).toMatchObject({ ok: true, value: { value: -100 } });
  expect(
    await executeToolCall(
      'set_attitude',
      { ...attitude, from: 'char:seller' },
      negative.ctx,
    ),
  ).toMatchObject({ ok: true, value: { value: 20 } });
});

it.each([
  [{ ...attitude, from: 'char:missing' }, 'NO_SUCH_ENTITY', 'char:missing'],
  [{ ...attitude, to: 'char:missing' }, 'NO_SUCH_ENTITY', 'char:missing'],
  [{ ...attitude, delta: 31 }, 'INVALID_INPUT', 'delta'],
  [{ ...attitude, delta: -31 }, 'INVALID_INPUT', 'delta'],
  [{ ...attitude, delta: 1.5 }, 'INVALID_INPUT', 'delta'],
  [{ ...attitude, delta: 20 }, 'ATTITUDE_DELTA_LIMIT', '20'],
])('rejects invalid attitude changes %#', async (input, code, field) => {
  const { ctx } = await fixture({
    config: configSchema.parse({ limits: { attitudeDelta: 10 } }),
  });
  await rejects(ctx, 'set_attitude', input, code, field);
});

it('shares facts once per recipient with the given source and all participants as witnesses', async () => {
  const { ctx } = await fixture();
  const result = await executeToolCall(
    'share_fact',
    { ...sharing, to: ['char:peer', 'char:player', 'char:peer'] },
    ctx,
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      learned: [
        {
          characterId: 'char:peer',
          factId: 'fact:rumour',
          source: 'told',
          since: 1,
          confidence: 1,
        },
        { characterId: 'char:player', factId: 'fact:rumour', source: 'told' },
      ],
    },
  });
  expect(ctx.events).toHaveLength(2);
  for (const draft of ctx.events)
    expect(draft).toMatchObject({
      type: 'FactLearned',
      actor: 'char:seller',
      createdBy: 'engine',
      witnesses: ['char:peer', 'char:player', 'char:seller'],
    });
  expect(
    (
      await executeToolCall(
        'share_fact',
        { ...sharing, from: 'char:peer', to: ['char:watcher'] },
        ctx,
      )
    ).ok,
  ).toBe(true);
});

it.each(['deduced', 'read', 'witnessed'])(
  'shares without a teller using the player room and source %s',
  async (source) => {
    const { ctx } = await fixture();
    expect(
      await executeToolCall(
        'share_fact',
        { factId: 'fact:unknown', to: ['char:peer'], source },
        ctx,
      ),
    ).toMatchObject({
      ok: true,
      events: [{ witnesses: ['char:peer'], actor: null, payload: { source } }],
    });
    await rejects(
      ctx,
      'share_fact',
      { factId: 'fact:rumour', to: ['char:other'], source },
      'NOT_IN_SAME_ROOM',
      'char:other',
    );
  },
);

it.each([
  [{ ...sharing, factId: 'fact:missing' }, 'NO_SUCH_ENTITY', 'fact:missing'],
  [{ ...sharing, from: 'char:missing' }, 'NO_SUCH_ENTITY', 'char:missing'],
  [{ ...sharing, from: 'char:peer' }, 'FACT_NOT_KNOWN', 'char:peer'],
  [
    { ...sharing, to: ['char:peer', 'char:missing'] },
    'NO_SUCH_ENTITY',
    'char:missing',
  ],
  [
    { ...sharing, to: ['char:peer', 'char:other'] },
    'NOT_IN_SAME_ROOM',
    'char:other',
  ],
  [{ ...sharing, source: 'seed' }, 'INVALID_INPUT', 'source'],
])('rejects sharing atomically %#', async (input, code, field) => {
  const { ctx } = await fixture();
  await rejects(ctx, 'share_fact', input, code, field);
});

it('uses current engine positions for the teller rule, even away from the player', async () => {
  const { ctx } = await fixture();
  expect(
    (
      await executeToolCall(
        'move',
        { actor: 'char:seller', to: 'loc:other' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeToolCall(
        'share_fact',
        { ...sharing, to: ['char:other'] },
        ctx,
      )
    ).ok,
  ).toBe(true);
  await rejects(ctx, 'share_fact', sharing, 'NOT_IN_SAME_ROOM');
});
