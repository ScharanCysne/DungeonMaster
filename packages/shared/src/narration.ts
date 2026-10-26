import { z } from 'zod';
import { entityIdSchema } from './ids.js';

export const moodSchema = z.enum(['calm', 'tense', 'comic', 'ominous']);
export type Mood = z.infer<typeof moodSchema>;
export const dialogueLineSchema = z.strictObject({
  speaker: entityIdSchema,
  text: z.string(),
  private: z.boolean().optional(),
});
export type DialogueLine = z.infer<typeof dialogueLineSchema>;
export const narrationSchema = z.strictObject({
  text: z
    .string()
    .refine((text) => text.trim().split(/\s+/u).filter(Boolean).length <= 180, {
      message: 'Narration must contain at most 180 words',
    }),
  lines: z.array(dialogueLineSchema),
  mood: moodSchema.optional(),
});
export type Narration = z.infer<typeof narrationSchema>;
