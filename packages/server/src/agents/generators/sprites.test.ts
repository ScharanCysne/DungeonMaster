import { generateNpcOutputSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { loadEpisode } from '../../content/index.js';
import { executeToolCall } from '../tools/execute.js';
import { npcSpritePool, selectSprite } from './sprites.js';
import { fixture, npc, npcInput, structured } from './testing.js';

it('uses the neutral treasure frame for unmatched tools and generic items', async () => {
  const { sprites } = await loadEpisode();
  for (const kind of ['tool', 'item'] as const)
    expect(
      selectSprite(['dented tin', 'red thread'], kind, 'item:ladle', sprites),
    ).toEqual({
      sprite: 'kenney-1-bit:237',
      fallback: true,
    });
  expect(selectSprite(['tools'], 'tool', 'item:adze', sprites)).toEqual({
    sprite: 'kenney-1-bit:237',
    fallback: false,
  });
  expect(sprites.fallbacks.treasure).toBe('kenney-1-bit:237');
  expect(sprites.tags.key).toBe('kenney-1-bit:571');
  expect(sprites.overrides['item:thieves-tools']).toBe('kenney-1-bit:571');
});

it('has twelve humanoid candidates with no seeded character sprite collisions', async () => {
  const { sprites, seed } = await loadEpisode();
  const seeded = seed.characters.map(
    (character) => sprites.overrides[character.id],
  );
  expect(seeded).toEqual([
    'kenney-1-bit:74',
    'kenney-1-bit:124',
    'kenney-1-bit:77',
    'kenney-1-bit:128',
    'kenney-1-bit:172',
    'kenney-1-bit:319',
    'kenney-1-bit:470',
    'kenney-1-bit:75',
    'kenney-1-bit:222',
  ]);
  expect(npcSpritePool).toEqual(
    [25, 26, 76, 78, 79, 80, 126, 127, 173, 174, 175, 176].map(
      (frame) => `kenney-1-bit:${frame}`,
    ),
  );
  expect(npcSpritePool.filter((sprite) => seeded.includes(sprite))).toEqual([]);
});

it('deterministically varies unmatched NPCs, including generic human tags', async () => {
  const { sprites } = await loadEpisode();
  const ids = [
    'char:merrin-reed',
    'char:tessa-vale',
    'char:oren-pike',
    'char:quiet-cooper',
  ];
  const choices = ids.map((id) => selectSprite(['cooper'], 'npc', id, sprites));
  expect(new Set(choices.map(({ sprite }) => sprite)).size).toBeGreaterThan(1);
  for (const [index, id] of ids.entries()) {
    const choice = choices[index];
    expect(choice?.fallback).toBe(true);
    expect(npcSpritePool).toContain(choice?.sprite);
    expect(selectSprite([' HUMAN ', 'apron'], 'npc', id, sprites)).toEqual(
      choice,
    );
    expect(selectSprite([], 'npc', id, structuredClone(sprites))).toEqual(
      choice,
    );
    expect(
      selectSprite(['coins', 'tools', 'human'], 'npc', id, sprites),
    ).toEqual(choice);
  }
});

it('excludes candidates assigned to seeded character overrides', async () => {
  const { sprites } = await loadEpisode();
  const before = selectSprite([], 'npc', 'char:merrin-reed', sprites);
  sprites.overrides['char:extra-seed'] = before.sprite;
  const after = selectSprite([], 'npc', 'char:merrin-reed', sprites);
  expect(after.sprite).not.toBe(before.sprite);
  expect(npcSpritePool).toContain(after.sprite);
});

it('never reuses a seeded character frame through a role tag', async () => {
  const { sprites } = await loadEpisode();
  const seededFrame = sprites.overrides['char:stranger'];
  const tag = Object.entries(sprites.tags).find(
    ([, sprite]) => sprite === seededFrame,
  )?.[0];
  if (!tag || !seededFrame)
    throw new Error('Expected a tag for the seeded frame');
  const { sprite } = selectSprite([tag], 'npc', 'char:pip-harrow', sprites);
  expect(sprite).not.toBe(seededFrame);
});

it('routes a role tag that names a seeded frame to the pool, but honours pool-frame role tags', async () => {
  const raw = {
    ...npc,
    npc: { ...npc.npc, tags: [' HUMAN ', ' COOK ', 'apron'] },
  };
  const { ctx, sprites } = await fixture([structured(raw)]);
  const result = await executeToolCall('generate_npc', npcInput, ctx);
  if (!result.ok) throw new Error(result.error.message);
  const { npc: created } = generateNpcOutputSchema.parse(result.value);
  // `cook` names Marta's seeded frame, so the generated cook gets a pool frame.
  expect(created.sprite).not.toBe(sprites.tags.cook);
  expect(npcSpritePool).toContain(created.sprite);
  const event = ctx.events.find(
    (entry) =>
      entry.type === 'EntityCreated' && entry.payload.entity.id === created.id,
  );
  expect(event).toMatchObject({
    type: 'EntityCreated',
    payload: { entity: { id: created.id, sprite: created.sprite } },
  });
  sprites.tags.guard = 'kenney-1-bit:78';
  expect(selectSprite(['guard'], 'npc', 'char:guard', sprites)).toEqual({
    sprite: 'kenney-1-bit:78',
    fallback: false,
  });
});

it('never gives a generated object the frame of a quest-critical item', async () => {
  const { sprites } = await loadEpisode();
  const quillFrame = sprites.overrides['item:quill'];
  if (!quillFrame) throw new Error('Expected a quill override');
  const reserved = new Set([quillFrame]);
  const { sprite } = selectSprite(
    ['feather', 'carved'],
    'item',
    'item:wooden-sparrow',
    sprites,
    reserved,
  );
  expect(sprite).not.toBe(quillFrame);
});
