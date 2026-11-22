import {
  generateFeatureOutputSchema,
  generateNpcOutputSchema,
  generateStoryOutputSchema,
} from '@dungeon/shared';
import { expect, it } from 'vitest';
import { inside } from '../../engine/spatial.js';
import { executeToolCall } from '../tools/execute.js';
import { rejects } from '../tools/testing/fixtures.js';
import { npcSpritePool } from './sprites.js';
import {
  feature,
  featureInput,
  fixture,
  npc,
  npcInput,
  story,
  storyInput,
  structured,
} from './testing.js';

it('registers an NPC, its starting items, secret ownership/knowledge, and seeded attitudes', async () => {
  const { ctx, engine } = await fixture([structured(npc)]);
  const result = await executeToolCall('generate_npc', npcInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  const value = generateNpcOutputSchema.parse(result.value);
  expect(npcSpritePool).toContain(value.npc.sprite);
  expect(engine.state.characters.get(value.npc.id)).toMatchObject({
    tile: { x: 0, y: 0 },
    inventory: [value.startingItems[0]?.item.id],
    role: 'npc',
  });
  const view = await ctx.softState();
  expect(await view.getNode(value.npc.id)).toMatchObject(value.npc);
  expect(
    await view.edges({ types: ['HAS_SECRET'], from: value.npc.id }),
  ).toMatchObject([{ to: value.secret.id }]);
  expect(
    await view.edges({ types: ['KNOWS'], to: value.secret.id }),
  ).toMatchObject([
    {
      from: value.npc.id,
      properties: { source: 'deduced', since: 1, confidence: 1 },
    },
  ]);
  expect(
    await view.edges({ types: ['ABOUT'], from: value.secret.id }),
  ).toMatchObject([{ to: value.npc.id }]);
  expect(await view.edges({ types: ['ATTITUDE'], from: value.npc.id })).toEqual(
    value.attitudes,
  );
  expect(value.attitudes[0]?.properties.value).toBe(45);
  expect(ctx.events.map((event) => event.type)).toEqual([
    'EntityCreated',
    'EntityCreated',
    'FactCreated',
    'FactLearned',
    'FactCreated',
  ]);
  expect(
    (
      await executeToolCall(
        'share_fact',
        {
          from: value.npc.id,
          to: ['char:player'],
          factId: value.secret.id,
          source: 'told',
        },
        ctx,
      )
    ).ok,
  ).toBe(true);
});

it('places a feature on the nearest unoccupied walkable tile and starts empty/closed', async () => {
  const { ctx, engine, sprites } = await fixture([structured(feature)]);
  const before = engine.state;
  const result = await executeToolCall('generate_feature', featureInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  const value = generateFeatureOutputSchema.parse(result.value);
  expect(value.tile).toEqual({ x: 2, y: 1 });
  expect(value.sprite).toBe(sprites.tags.brick);
  expect(engine.state.containers.get(value.id)).toMatchObject({
    contents: [],
    opened: false,
    tile: value.tile,
  });
  const bounds = before.locations.get('loc:room')?.tileBounds;
  if (!bounds) throw new Error('Missing location');
  expect(inside(value.tile, bounds)).toBe(true);
  expect(before.grid.walkable[value.tile.y]?.[value.tile.x]).toBe(true);
  expect(
    [...before.characters.values(), ...before.containers.values()].some(
      (node) => node.tile.x === value.tile.x && node.tile.y === value.tile.y,
    ),
  ).toBe(false);
  const view = await ctx.softState();
  expect(await view.getNode(value.id)).toEqual(value);
  expect(
    await view.edges({ types: ['LOCATED_IN'], from: value.id }),
  ).toMatchObject([{ to: 'loc:room' }]);
});

it('places a feature within the real Episode N location, even for an out-of-bounds preferred tile', async () => {
  const raw = { ...feature, tile: { x: -100, y: -100 } };
  const { ctx, engine } = await fixture([structured(raw)], { real: true });
  const result = await executeToolCall(
    'generate_feature',
    { ...featureInput, locationId: 'loc:kitchen' },
    ctx,
  );
  if (!result.ok) throw new Error(result.error.message);
  const created = generateFeatureOutputSchema.parse(result.value);
  const location = engine.state.locations.get('loc:kitchen');
  if (!location) throw new Error('Missing kitchen');
  expect(inside(created.tile, location.tileBounds)).toBe(true);
  expect(engine.state.grid.walkable[created.tile.y]?.[created.tile.x]).toBe(
    true,
  );
});

it.each([
  ['missing findDc', { ...feature, findDc: undefined }, 'findDc'],
  ['missing lockDc', { ...feature, lockDc: undefined }, 'lockDc'],
  ['wrong hidden', { ...feature, hidden: false }, 'hidden'],
  ['wrong locked', { ...feature, locked: false }, 'locked'],
  ['invalid DC', { ...feature, lockDc: 6 }, 'lockDc'],
])('rejects feature %s', async (_, output, problem) => {
  const { ctx } = await fixture([structured(output), structured(output)]);
  await rejects(
    ctx,
    'generate_feature',
    featureInput,
    'GENERATION_FAILED',
    problem,
  );
});

it('records story facts and exactly the ABOUT facts shown to the story role', async () => {
  const { ctx, engine, provider } = await fixture([structured(story)], {
    role: 'story',
  });
  const before = engine.snapshot();
  const result = await executeToolCall('generate_story', storyInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  const value = generateStoryOutputSchema.parse(result.value);
  expect(engine.snapshot()).toEqual(before);
  expect(provider.requests[0]?.role).toBe('story');
  const source = ctx.storyFacts[0];
  expect(source?.facts).toEqual(value.facts);
  expect(source?.basedOn).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'fact:secret' })]),
  );
  const content = provider.requests[0]?.messages[0]?.content;
  if (typeof content !== 'string') throw new Error('Expected context');
  const graph = content.split('Graph context: ')[1]?.split('\n\n')[0];
  if (!graph) throw new Error('Missing context');
  const parsed: unknown = JSON.parse(graph);
  expect(parsed).toMatchObject({ aboutFacts: source?.basedOn });
  const view = await ctx.softState();
  expect(
    await view.getNode(value.facts[0]?.id ?? 'fact:missing'),
  ).toMatchObject({ createdBy: 'generator:story' });
  expect(ctx.events.every((event) => event.type === 'FactCreated')).toBe(true);
});

it('attaches requested story subjects and origin edges for backstory', async () => {
  const raw = { facts: [{ ...story.facts[0], kind: 'backstory', about: [] }] };
  const { ctx } = await fixture([structured(raw)], { role: 'story' });
  expect(
    (
      await executeToolCall(
        'generate_story',
        {
          ...storyInput,
          kind: 'backstory',
          about: ['char:seller', 'item:rock'],
        },
        ctx,
      )
    ).ok,
  ).toBe(true);
  const view = await ctx.softState();
  const fact = ctx.storyFacts[0]?.facts[0];
  if (!fact) throw new Error('Missing story');
  expect(
    await view.edges({ types: ['ORIGIN_OF'], from: fact.id }),
  ).toHaveLength(2);
  expect(await view.edges({ types: ['ABOUT'], from: fact.id })).toHaveLength(2);
  expect(await view.edges({ types: ['KNOWS'], to: fact.id })).toEqual([]);
});

it.each([
  ['wrong kind', { ...storyInput, kind: 'rumour' }, 'expected rumour'],
  [
    'missing subject',
    { ...storyInput, about: ['char:missing'] },
    'char:missing',
  ],
  [
    'protected subject',
    { ...storyInput, about: ['item:quest'] },
    'quest-critical',
  ],
])('leaves no critic entry on story failure: %s', async (_, input, problem) => {
  const { ctx } = await fixture([structured(story), structured(story)], {
    role: 'story',
  });
  await rejects(ctx, 'generate_story', input, 'GENERATION_FAILED', problem);
  expect(ctx.storyFacts).toEqual([]);
});
