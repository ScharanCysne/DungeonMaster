import type { SpriteManifest } from '@dungeon/shared';
import { selectSprite } from '../agents/generators/sprites.js';
import type { LogDraft } from '../ontology/eventLog.js';

export function spriteFallbackStats(
  events: readonly LogDraft[],
  sprites: SpriteManifest,
) {
  let generatedEntities = 0;
  let spriteFallbacks = 0;
  for (const event of events) {
    if (event.type !== 'EntityCreated') continue;
    const { entity } = event.payload;
    if (!entity.createdBy.startsWith('generator:')) continue;
    const kind =
      'role' in entity
        ? 'npc'
        : 'questCritical' in entity
          ? entity.kind
          : 'locked' in entity
            ? 'container'
            : undefined;
    if (!kind) continue;
    generatedEntities++;
    if (selectSprite(entity.tags, kind, entity.id, sprites).fallback)
      spriteFallbacks++;
  }
  return {
    generatedEntities,
    spriteFallbacks,
    spriteFallbackRate: generatedEntities
      ? spriteFallbacks / generatedEntities
      : 0,
  };
}
