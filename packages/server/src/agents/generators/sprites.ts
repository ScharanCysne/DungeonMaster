import type { SpriteManifest } from '@dungeon/shared';
import { normalizedTag } from './context.js';

export const npcSpritePool: readonly string[] = [
  25, 26, 76, 78, 79, 80, 126, 127, 173, 174, 175, 176,
].map((frame) => `kenney-1-bit:${frame}`);

export function catalogueMatch(
  tags: readonly string[],
  sprites: SpriteManifest,
  reserved: ReadonlySet<string> = new Set(),
) {
  return tags.map(normalizedTag).find((tag) => {
    const sprite = sprites.tags[tag];
    return sprite !== undefined && !reserved.has(sprite);
  });
}

export function selectSprite(
  tags: readonly string[],
  kind: keyof SpriteManifest['fallbacks'],
  id: string,
  sprites: SpriteManifest,
  // Frames of quest-critical items: a generated object must never look like one.
  reserved: ReadonlySet<string> = new Set(),
) {
  const seeded = new Set(
    Object.entries(sprites.overrides)
      .filter(([entityId]) => entityId.startsWith('char:'))
      .map(([, sprite]) => sprite),
  );
  // A role tag may only pick a pool frame: reusing a seeded character's frame
  // would make a generated NPC indistinguishable from that character.
  const generatedFrames = new Set(
    npcSpritePool.filter((sprite) => !seeded.has(sprite)),
  );
  // Generic ancestry must not give every human the same frame.
  const match = catalogueMatch(
    kind === 'npc'
      ? tags.filter((tag) => {
          const normalized = normalizedTag(tag);
          return (
            normalized !== 'human' &&
            generatedFrames.has(sprites.tags[normalized] ?? '')
          );
        })
      : tags,
    sprites,
    reserved,
  );
  const sprite = match ? sprites.tags[match] : undefined;
  if (sprite) return { sprite, fallback: false };
  if (kind === 'npc') {
    let hash = 2166136261;
    for (const character of id)
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    const pool = npcSpritePool.filter((sprite) => !seeded.has(sprite));
    return {
      sprite: pool[hash % pool.length] ?? sprites.fallbacks.npc,
      fallback: true,
    };
  }
  return { sprite: sprites.fallbacks[kind], fallback: true };
}
