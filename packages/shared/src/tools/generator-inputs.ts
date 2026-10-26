import { z } from 'zod';
import { entityIdSchema, locationIdSchema } from '../ids.js';
import {
  attitudeValueSchema,
  holderIdSchema,
  itemKindSchema,
  raritySchema,
} from '../primitives.js';

export const generateItemInputSchema = z.strictObject({
  brief: z.string().min(1),
  placement: holderIdSchema,
  constraints: z
    .strictObject({
      kind: itemKindSchema.optional(),
      maxRarity: raritySchema.optional(),
    })
    .optional(),
});
export type GenerateItemInput = z.infer<typeof generateItemInputSchema>;
export const generateNpcInputSchema = z.strictObject({
  brief: z.string().min(1),
  locationId: locationIdSchema,
  hints: z
    .strictObject({
      role: z.string().optional(),
      attitudeToParty: attitudeValueSchema.optional(),
    })
    .optional(),
});
export type GenerateNpcInput = z.infer<typeof generateNpcInputSchema>;
export const generateFeatureInputSchema = z.strictObject({
  brief: z.string().min(1),
  locationId: locationIdSchema,
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
});
export type GenerateFeatureInput = z.infer<typeof generateFeatureInputSchema>;
export const generateStoryInputSchema = z.strictObject({
  brief: z.string().min(1),
  about: z.array(entityIdSchema),
  kind: z.enum(['lore', 'backstory', 'rumour']),
});
export type GenerateStoryInput = z.infer<typeof generateStoryInputSchema>;
