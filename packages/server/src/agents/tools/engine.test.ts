import { configSchema, toolSchemas } from '@dungeon/shared';
import { expect, it, vi } from 'vitest';
import { diceSeed } from '../../engine/testing/combat.js';
import { executeToolCall } from './execute.js';
import {
  attitude,
  fixture,
  newFact,
  rejects,
  sharing,
  story,
} from './testing/fixtures.js';

const commands = [
  ['move', { actor: 'char:player', to: 'loc:room' }],
  [
    'skill_check',
    {
      actor: 'char:player',
      skill: 'perception',
      dc: 5,
      advantage: 'none',
      reason: '',
    },
  ],
  [
    'contested_check',
    {
      actor: 'char:player',
      skill: 'stealth',
      target: 'char:seller',
      targetSkill: 'perception',
      reason: '',
    },
  ],
  ['search', { actor: 'char:player', area: 'loc:room', checkId: 'missing' }],
  ['open_container', { actor: 'char:player', container: 'container:box' }],
  [
    'unlock_container',
    {
      actor: 'char:player',
      container: 'container:lockbox',
      method: 'key',
      itemId: 'item:key',
    },
  ],
  [
    'transfer_item',
    {
      actor: 'char:player',
      item: 'item:floor',
      to: 'char:player',
      reason: 'pick_up',
    },
  ],
  ['equip', { actor: 'char:player', item: 'item:rock', slot: 'main_hand' }],
  ['unequip', { actor: 'char:player', item: 'item:rock', slot: 'main_hand' }],
  ['hide', { actor: 'char:player', checkId: 'missing' }],
  ['attack', { attacker: 'char:player', target: 'char:seller' }],
  ['apply_damage', { target: 'char:seller', dice: '1d4', cause: 'fall' }],
  ['heal', { target: 'char:seller', dice: '1d4', source: 'rest' }],
  ['pass_turn', { actor: 'char:player' }],
  ['end_combat', { reason: 'talked_down' }],
] as const;

it.each(commands)(
  'delegates %s with parsed JSON and returns the engine result',
  async (name, input) => {
    const { ctx, engine } = await fixture();
    const spy = vi.spyOn(engine, name);
    const json: unknown = JSON.parse(JSON.stringify(input));
    const result = await executeToolCall(name, json, ctx);
    expect(spy).toHaveBeenCalledExactlyOnceWith(input);
    expect(result).toBe(spy.mock.results[0]?.value);
    if (result.ok)
      expect(toolSchemas[name].output.safeParse(result.value).success).toBe(
        true,
      );
    expect(ctx.events).toEqual(
      engine
        .collectEvents()
        .map((event) => ({ ...event, createdBy: 'engine' })),
    );
  },
);

it('moves, rolls a receipt, and spends it on search through ordinary JSON calls', async () => {
  const { ctx, engine } = await fixture();
  expect(
    (
      await executeToolCall(
        'move',
        { actor: 'char:player', to: 'loc:room' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  const check = await executeToolCall(
    'skill_check',
    {
      actor: 'char:player',
      skill: 'perception',
      ability: null,
      dc: 5,
      advantage: 'none',
      reason: 'Find the hidden features',
    },
    ctx,
  );
  if (!check.ok) throw new Error(check.error.message);
  const { checkId, outcome } = toolSchemas.skill_check.output.parse(
    check.value,
  );
  expect(outcome).toBe('success');
  expect(engine.successfulReceipts().map((receipt) => receipt.id)).toContain(
    checkId,
  );
  const search = await executeToolCall(
    'search',
    { actor: 'char:player', area: 'loc:room', checkId },
    ctx,
  );
  if (!search.ok) throw new Error(search.error.message);
  const { revealed } = toolSchemas.search.output.parse(search.value);
  expect(revealed).toContain('container:secret');
  expect(revealed).toContain('item:secret');
  expect(engine.successfulReceipts()).toEqual([]);
  await rejects(
    ctx,
    'search',
    { actor: 'char:player', area: 'loc:room', checkId },
    'RECEIPT_SPENT',
  );
});

it('preserves one chronological stream across engine, soft-state and generator calls', async () => {
  const { ctx, engine } = await fixture();
  await executeToolCall('move', { actor: 'char:player', to: 'loc:room' }, ctx);
  await executeToolCall('set_attitude', attitude, ctx);
  await executeToolCall(
    'open_container',
    { actor: 'char:player', container: 'container:box' },
    ctx,
  );
  await executeToolCall('share_fact', sharing, ctx);
  await executeToolCall('create_fact', newFact, ctx);
  await executeToolCall('generate_story', story, ctx);
  await executeToolCall(
    'set_quest_status',
    { quest: 'quest:personal', status: 'complete' },
    ctx,
  );
  expect(ctx.events.map((event) => event.type)).toEqual([
    'EntityMoved',
    'AttitudeChanged',
    'ContainerOpened',
    'FactLearned',
    'FactCreated',
    'FactLearned',
    'FactCreated',
    'QuestStatusChanged',
  ]);
  expect(ctx.events.map((event) => event.createdBy)).toEqual([
    'engine',
    'engine',
    'engine',
    'engine',
    'dm',
    'dm',
    'generator:story',
    'engine',
  ]);
  expect(ctx.events.map((event) => event.witnesses)).toEqual([
    engine.collectEvents()[0]?.witnesses,
    ['char:peer'],
    engine.collectEvents()[1]?.witnesses,
    ['char:peer', 'char:seller'],
    ['char:player'],
    ['char:player'],
    [],
    ['char:peer'],
  ]);
  const detached = ctx.events;
  detached[0]?.witnesses.splice(0);
  expect(ctx.events[0]?.witnesses.length).toBeGreaterThan(0);
});

it('refreshes earlier engine witnesses after a later contest without moving soft events', async () => {
  const { ctx } = await fixture({
    config: configSchema.parse({ limits: { toolCalls: 102 } }),
  });
  await executeToolCall(
    'open_container',
    { actor: 'char:player', container: 'container:box' },
    ctx,
  );
  await executeToolCall('set_attitude', attitude, ctx);
  expect(ctx.events[0]?.witnesses).toContain('char:seller');
  for (let i = 0; i < 100; i++) {
    const result = await executeToolCall(
      'contested_check',
      {
        actor: 'char:player',
        skill: 'stealth',
        target: 'char:seller',
        targetSkill: 'perception',
        reason: '',
      },
      ctx,
    );
    if (
      result.ok &&
      toolSchemas.contested_check.output.parse(result.value).winner ===
        'char:player'
    )
      break;
  }
  expect(ctx.events[0]?.witnesses).not.toContain('char:seller');
  expect(ctx.events[1]).toMatchObject({
    type: 'AttitudeChanged',
    witnesses: ['char:peer'],
  });
  expect(
    ctx.events.slice(2).every((event) => event.type === 'CheckRolled'),
  ).toBe(true);
});

it('collects CombatStarted even when an initiating attack returns NOT_YOUR_TURN', async () => {
  const { ctx, engine } = await fixture({
    sessionSeed: diceSeed(1, 20),
  });
  const result = await executeToolCall(
    'attack',
    { attacker: 'char:player', target: 'char:seller' },
    ctx,
  );
  expect(result).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
  expect(ctx.events.map((event) => event.type)).toEqual(['CombatStarted']);
  expect(engine.state.combat).not.toBeNull();
});
