import { z } from 'zod';
import { edgeSchemas } from '../edges.js';
import {
  characterSchema,
  containerSchema,
  factSchema,
  itemSchema,
} from '../ontology.js';

export const generateItemOutputSchema = z.strictObject({
  item: itemSchema,
  backstory: z
    .array(factSchema.extend({ kind: z.literal('backstory') }))
    .min(1)
    .max(2),
});
export type GenerateItemOutput = z.infer<typeof generateItemOutputSchema>;
export const generateNpcOutputSchema = z.strictObject({
  npc: characterSchema.extend({ role: z.literal('npc') }),
  secret: factSchema.extend({ kind: z.literal('secret') }),
  attitudes: z.array(edgeSchemas.ATTITUDE),
  startingItems: z.array(generateItemOutputSchema),
});
export type GenerateNpcOutput = z.infer<typeof generateNpcOutputSchema>;
export const generateFeatureOutputSchema = containerSchema.extend({
  opened: z.literal(false),
});
export type GenerateFeatureOutput = z.infer<typeof generateFeatureOutputSchema>;
export const generateStoryOutputSchema = z.strictObject({
  facts: z
    .array(factSchema.extend({ kind: z.enum(['lore', 'backstory', 'rumour']) }))
    .min(1)
    .max(3),
});
export type GenerateStoryOutput = z.infer<typeof generateStoryOutputSchema>;
