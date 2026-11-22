import { entityIdSchema } from '@dungeon/shared';
import type { EntityId } from '@dungeon/shared';

export function mentionsName(text: string, name: string): boolean {
  const escaped = name.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    'iu',
  ).test(text.normalize('NFKC'));
}

export function referencedIds(input: unknown): EntityId[] {
  if (typeof input === 'string') {
    const parsed = entityIdSchema.safeParse(input);
    return parsed.success ? [parsed.data] : [];
  }
  if (Array.isArray(input)) return input.flatMap(referencedIds);
  if (input !== null && typeof input === 'object')
    return Object.values(input).flatMap(referencedIds);
  return [];
}
