import { z } from 'zod';
import { characterIdSchema, entityIdSchema } from '../ids.js';
import { characterSchema, containerSchema, itemSchema } from '../ontology.js';
import { factKindSchema, factTruthSchema } from '../primitives.js';

export const generatedFactSchema = z.strictObject({
  statement: z.string().min(1),
  truth: factTruthSchema,
  kind: factKindSchema,
  about: z.array(entityIdSchema),
});
export type GeneratedFact = z.infer<typeof generatedFactSchema>;
// Identity/provenance and questCritical are assigned by registration, not the model.
const generatedFields = {
  id: true,
  createdBy: true,
  createdAtBeat: true,
} as const;
export const generatedItemContentSchema = itemSchema
  .omit({ ...generatedFields, questCritical: true })
  .extend({
    weight: z.number(),
    value: z.number(),
    findDc: z.int().optional(),
  });
export type GeneratedItemContent = z.infer<typeof generatedItemContentSchema>;
export const generatedItemSchema = z.strictObject({
  item: generatedItemContentSchema,
  backstory: z
    .array(generatedFactSchema.extend({ kind: z.literal('backstory') }))
    .min(1)
    .max(2),
});
export type GeneratedItem = z.infer<typeof generatedItemSchema>;
export const generatedNpcContentSchema = characterSchema
  .omit(generatedFields)
  .extend({
    role: z.literal('npc'),
    abilities: z.strictObject({
      str: z.int(),
      dex: z.int(),
      con: z.int(),
      int: z.int(),
      wis: z.int(),
      cha: z.int(),
    }),
    hp: z.int(),
    maxHp: z.int(),
    ac: z.int(),
    gold: z.int(),
  });
export type GeneratedNpcContent = z.infer<typeof generatedNpcContentSchema>;
export const generatedAttitudeSchema = z.strictObject({
  to: characterIdSchema,
  value: z.int(),
  reason: z.string(),
});
export type GeneratedAttitude = z.infer<typeof generatedAttitudeSchema>;
export const generatedNpcSchema = z.strictObject({
  npc: generatedNpcContentSchema,
  secret: generatedFactSchema.extend({ kind: z.literal('secret') }),
  attitudes: z.array(generatedAttitudeSchema),
  startingItems: z.array(generatedItemSchema).optional(),
});
export type GeneratedNpc = z.infer<typeof generatedNpcSchema>;
export const generatedFeatureSchema = containerSchema
  .omit(generatedFields)
  .extend({
    opened: z.literal(false),
    lockDc: z.int().optional(),
    findDc: z.int().optional(),
  });
export type GeneratedFeature = z.infer<typeof generatedFeatureSchema>;
export const generatedStorySchema = z.strictObject({
  facts: z
    .array(
      generatedFactSchema.extend({
        kind: z.enum(['lore', 'backstory', 'rumour']),
      }),
    )
    .min(1)
    .max(3),
});
export type GeneratedStory = z.infer<typeof generatedStorySchema>;
