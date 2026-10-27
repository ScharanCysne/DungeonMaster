import { generatedItemSchema, generateItemOutputSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import {
  LlmRefusalError,
  LlmRequestError,
  LlmUnavailableError,
} from '../llm/errors.js';
import { executeToolCall } from '../tools/execute.js';
import { rejects } from '../tools/testing/fixtures.js';
import { fixture, item, itemInput, structured } from './testing.js';

it('retries policy failure with the problems, then registers a structured response', async () => {
  const invalid = {
    ...item,
    item: { ...item.item, value: 501, rarity: 'legendary' },
  };
  const { ctx, provider } = await fixture([
    structured(invalid),
    structured(item),
  ]);
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  expect(provider.requests).toHaveLength(2);
  expect(provider.requests[0]?.outputFormat).toBe(generatedItemSchema);
  expect(provider.requests[0]?.role).toBe('generator');
  expect(provider.requests[0]?.promptVersion).toBe('generator-item:v2');
  expect(provider.requests[0]?.system[0]?.cache).toBe(true);
  expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
    'maximum rare',
  );
  expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
    'maximum 500 gp',
  );
  expect(provider.requests[0]).not.toHaveProperty('tools');
  expect(ctx.counters.generatorCalls).toBe(1);
  provider.assertDrained();
});

it('retries malformed structured output once', async () => {
  const { ctx, provider } = await fixture([
    structured({ item: {} }),
    structured(item),
  ]);
  expect((await executeToolCall('generate_item', itemInput, ctx)).ok).toBe(
    true,
  );
  expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
    'failed validation',
  );
});

it('two malformed responses fail without any pending or committed changes', async () => {
  const { ctx, provider } = await fixture([structured({}), structured({})]);
  await rejects(
    ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    'failed validation',
  );
  expect(provider.requests).toHaveLength(2);
});

it.each([
  new LlmRefusalError('generator', 'claude-sonnet-5-5'),
  new LlmRequestError(
    'generator',
    'claude-sonnet-5-5',
    'invalid request (400)',
  ),
])('returns a tool error for $name without retrying', async (error) => {
  const { ctx, provider } = await fixture([{ type: 'error', error }]);
  await rejects(
    ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    error.message,
  );
  expect(provider.requests).toHaveLength(1);
});

it('propagates provider unavailability and preserves state for session pause', async () => {
  const error = new LlmUnavailableError(
    'generator',
    'claude-sonnet-5-5',
    'connection failed',
  );
  const { ctx, engine, provider } = await fixture([{ type: 'error', error }]);
  const before = engine.snapshot();
  await expect(executeToolCall('generate_item', itemInput, ctx)).rejects.toBe(
    error,
  );
  expect(engine.snapshot()).toEqual(before);
  expect(ctx.events).toEqual([]);
  expect(provider.requests).toHaveLength(1);
});

it('keeps refusal replies as a failed tool result', async () => {
  const { ctx } = await fixture([{ type: 'refusal' }]);
  await rejects(
    ctx,
    'generate_item',
    itemInput,
    'GENERATION_FAILED',
    'final refusal',
  );
});

it('registers item provenance, sprite, origin and ABOUT without revealing backstory', async () => {
  const { ctx, engine, store, sprites } = await fixture([structured(item)]);
  const result = await executeToolCall('generate_item', itemInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  const value = generateItemOutputSchema.parse(result.value);
  expect(result.facts.join(' ')).toContain('Copper Thimble');
  expect(value.item).toMatchObject({
    createdBy: 'generator:item',
    createdAtBeat: 1,
    questCritical: false,
    sprite: sprites.tags.coins,
  });
  expect(engine.state.containers.get('container:box')?.contents).toContain(
    value.item.id,
  );
  expect(await store.getNode(value.item.id)).toBeUndefined();
  const view = await ctx.softState();
  expect(await view.getNode(value.item.id)).toEqual(value.item);
  expect(
    await view.edges({ types: ['ORIGIN_OF'], to: value.item.id }),
  ).toHaveLength(1);
  expect(
    await view.edges({ types: ['ABOUT'], to: value.item.id }),
  ).toHaveLength(1);
  const backstory = value.backstory[0];
  if (!backstory) throw new Error('Missing backstory');
  expect(await view.edges({ types: ['KNOWS'], to: backstory.id })).toEqual([]);
  expect(ctx.events.map((event) => [event.type, event.createdBy])).toEqual([
    ['EntityCreated', 'generator:item'],
    ['FactCreated', 'generator:item'],
  ]);
});

it('resolves the first matching sprite tag', async () => {
  const raw = {
    ...item,
    item: { ...item.item, tags: ['Unmapped', ' COINS ', 'quill'] },
  };
  const { ctx, sprites } = await fixture([structured(raw)]);
  const result = await executeToolCall('generate_item', itemInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  expect(generateItemOutputSchema.parse(result.value).item.sprite).toBe(
    sprites.tags.coins,
  );
});

it('picks up an item from an opened container in the same ordered beat', async () => {
  const { ctx, engine } = await fixture([structured(item)]);
  expect(
    (
      await executeToolCall(
        'open_container',
        { actor: 'char:player', container: 'container:box' },
        ctx,
      )
    ).ok,
  ).toBe(true);
  const generated = await executeToolCall('generate_item', itemInput, ctx);
  if (!generated.ok) throw new Error(generated.error.message);
  const { item: created } = generateItemOutputSchema.parse(generated.value);
  expect(
    (
      await executeToolCall(
        'transfer_item',
        {
          item: created.id,
          to: 'char:player',
          actor: 'char:player',
          reason: 'pick_up',
        },
        ctx,
      )
    ).ok,
  ).toBe(true);
  expect(engine.state.characters.get('char:player')?.inventory).toContain(
    created.id,
  );
  expect(ctx.events.map((event) => event.type)).toEqual([
    'ContainerOpened',
    'EntityCreated',
    'FactCreated',
    'ItemTransferred',
  ]);
  const view = await ctx.softState();
  expect(await view.edges({ types: ['CARRIES'], to: created.id })).toHaveLength(
    1,
  );
  expect(await view.edges({ types: ['CONTAINS'], to: created.id })).toEqual([]);
});
