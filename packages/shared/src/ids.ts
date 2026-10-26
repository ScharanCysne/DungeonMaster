import { z } from 'zod';

export const slugLabelSchema = z.enum([
  'char',
  'item',
  'loc',
  'container',
  'faction',
  'quest',
  'fact',
]);
export type SlugLabel = z.infer<typeof slugLabelSchema>;
export const entityLabelSchema = z.enum([...slugLabelSchema.options, 'event']);
export type EntityLabel = z.infer<typeof entityLabelSchema>;
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type Slug = z.infer<typeof slugSchema>;

export const characterIdSchema = z.templateLiteral(['char:', slugSchema]);
export type CharacterId = z.infer<typeof characterIdSchema>;
export const itemIdSchema = z.templateLiteral(['item:', slugSchema]);
export type ItemId = z.infer<typeof itemIdSchema>;
export const locationIdSchema = z.templateLiteral(['loc:', slugSchema]);
export type LocationId = z.infer<typeof locationIdSchema>;
export const containerIdSchema = z.templateLiteral(['container:', slugSchema]);
export type ContainerId = z.infer<typeof containerIdSchema>;
export const factionIdSchema = z.templateLiteral(['faction:', slugSchema]);
export type FactionId = z.infer<typeof factionIdSchema>;
export const questIdSchema = z.templateLiteral(['quest:', slugSchema]);
export type QuestId = z.infer<typeof questIdSchema>;
export const factIdSchema = z.templateLiteral(['fact:', slugSchema]);
export type FactId = z.infer<typeof factIdSchema>;
export const eventIdSchema = z
  .templateLiteral(['event:', z.number(), '-', z.number()])
  .refine((id) => /^event:(0|[1-9]\d*)-(0|[1-9]\d*)$/.test(id), {
    message: 'Expected event:<nonnegative beat>-<nonnegative sequence>',
  });
export type EventId = z.infer<typeof eventIdSchema>;
export const entityIdSchema = z.union([
  characterIdSchema,
  itemIdSchema,
  locationIdSchema,
  containerIdSchema,
  factionIdSchema,
  questIdSchema,
  factIdSchema,
  eventIdSchema,
]);
export type EntityId = z.infer<typeof entityIdSchema>;

export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unnamed'
  );
}

// Event ids come from log coordinates, never from display names.
export function uniqueId<L extends SlugLabel>(
  label: L,
  name: string,
  existingIds: Iterable<string>,
): `${L}:${string}` {
  const existing = new Set(existingIds);
  const base = `${label}:${slugify(name)}` as const;
  let candidate: `${L}:${string}` = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}
