import { z } from 'zod';
import {
  characterIdSchema,
  entityIdSchema,
  factIdSchema,
  questIdSchema,
} from '../ids.js';
import {
  factTruthSchema,
  knowledgeSourceSchema,
  questStatusSchema,
} from '../primitives.js';

export const setAttitudeInputSchema = z.strictObject({
  from: characterIdSchema,
  to: characterIdSchema,
  delta: z.int().min(-30).max(30),
  reason: z.string(),
});
export type SetAttitudeInput = z.infer<typeof setAttitudeInputSchema>;
export const shareFactInputSchema = z.strictObject({
  from: characterIdSchema.optional(),
  to: z.array(characterIdSchema),
  factId: factIdSchema,
  source: knowledgeSourceSchema.exclude(['seed']),
});
export type ShareFactInput = z.infer<typeof shareFactInputSchema>;
export const createFactInputSchema = z.strictObject({
  statement: z.string().min(1),
  truth: factTruthSchema,
  kind: z.enum(['rumour', 'observation', 'lore']),
  about: z.array(entityIdSchema),
  knownBy: z.array(characterIdSchema),
  supersedes: factIdSchema.optional(),
});
export type CreateFactInput = z.infer<typeof createFactInputSchema>;
export const setQuestStatusInputSchema = z.strictObject({
  quest: questIdSchema,
  status: questStatusSchema,
});
export type SetQuestStatusInput = z.infer<typeof setQuestStatusInputSchema>;
export const voiceNpcInputSchema = z.strictObject({
  npc: characterIdSchema,
  direction: z
    .string()
    .min(1)
    .refine((text) => text.trim().split(/\s+/u).filter(Boolean).length <= 40, {
      message: 'NPC direction must contain at most 40 words',
    }),
});
export type VoiceNpcInput = z.infer<typeof voiceNpcInputSchema>;
