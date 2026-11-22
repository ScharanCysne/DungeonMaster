import { z } from 'zod';
import { spriteFrameSchema } from './sprites.js';
import {
  characterIdSchema,
  containerIdSchema,
  entityIdSchema,
  eventIdSchema,
  factIdSchema,
  factionIdSchema,
  itemIdSchema,
  locationIdSchema,
  questIdSchema,
} from './ids.js';
import {
  abilitiesSchema,
  beatSchema,
  characterRoleSchema,
  createdBySchema,
  dcSchema,
  eventTypeSchema,
  factKindSchema,
  factTruthSchema,
  itemKindSchema,
  locationKindSchema,
  questKindSchema,
  questStatusSchema,
  raritySchema,
  rollSchema,
  skillSchema,
  tileBoundsSchema,
  tileSchema,
} from './primitives.js';

export const provenanceSchema = z.strictObject({
  createdBy: createdBySchema,
  createdAtBeat: beatSchema,
});
export type Provenance = z.infer<typeof provenanceSchema>;
export const commonNodeSchema = provenanceSchema.extend({
  id: entityIdSchema,
  name: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string()),
});
export type CommonNode = z.infer<typeof commonNodeSchema>;
export const characterSchema = commonNodeSchema.extend({
  sprite: spriteFrameSchema.optional(),
  id: characterIdSchema,
  role: characterRoleSchema,
  abilities: abilitiesSchema,
  proficiencies: z.array(skillSchema),
  hp: z.int().nonnegative(),
  maxHp: z.int().positive(),
  ac: z.int().nonnegative(),
  conscious: z.boolean(),
  hidden: z.boolean(),
  gold: z.int().nonnegative(),
  personality: z.string(),
  background: z.string(),
  appearance: z.string(),
});
export type Character = z.infer<typeof characterSchema>;
export const itemSchema = commonNodeSchema.extend({
  sprite: spriteFrameSchema.optional(),
  id: itemIdSchema,
  kind: itemKindSchema,
  rarity: raritySchema,
  magical: z.boolean(),
  properties: z.array(z.string()),
  damage: z.string().min(1).optional(),
  weight: z.number().nonnegative(),
  value: z.number().nonnegative(),
  hidden: z.boolean(),
  findDc: dcSchema.optional(),
  questCritical: z.boolean(),
});
export type Item = z.infer<typeof itemSchema>;
export const locationSchema = commonNodeSchema.extend({
  id: locationIdSchema,
  kind: locationKindSchema,
  tileBounds: tileBoundsSchema,
  lit: z.boolean(),
});
export type Location = z.infer<typeof locationSchema>;
export const containerSchema = commonNodeSchema.extend({
  sprite: spriteFrameSchema.optional(),
  id: containerIdSchema,
  locked: z.boolean(),
  lockDc: dcSchema.optional(),
  opened: z.boolean(),
  hidden: z.boolean(),
  findDc: dcSchema.optional(),
  tile: tileSchema,
});
export type Container = z.infer<typeof containerSchema>;
export const factionSchema = commonNodeSchema.extend({
  id: factionIdSchema,
  ideals: z.string(),
  standing: z.string(),
});
export type Faction = z.infer<typeof factionSchema>;
export const questSchema = commonNodeSchema.extend({
  id: questIdSchema,
  kind: questKindSchema,
  objective: z.string(),
  status: questStatusSchema,
});
export type Quest = z.infer<typeof questSchema>;
export const factSchema = commonNodeSchema.extend({
  id: factIdSchema,
  statement: z.string().min(1),
  truth: factTruthSchema,
  kind: factKindSchema,
});
export type Fact = z.infer<typeof factSchema>;
export const eventNodeSchema = commonNodeSchema.extend({
  id: eventIdSchema,
  beat: beatSchema,
  seq: z.int().nonnegative(),
  type: eventTypeSchema,
  private: z.boolean(),
  roll: rollSchema.optional(),
});
export type EventNode = z.infer<typeof eventNodeSchema>;
export const nodeSchema = z.union([
  characterSchema,
  itemSchema,
  locationSchema,
  containerSchema,
  factionSchema,
  questSchema,
  factSchema,
  eventNodeSchema,
]);
export type Node = z.infer<typeof nodeSchema>;
