import { z } from 'zod';
import { characterIdSchema } from './ids.js';

export const moodSchema = z.enum(['calm', 'tense', 'comic', 'ominous']);
export type Mood = z.infer<typeof moodSchema>;
export const dialogueLineSchema = z.union([
  z.strictObject({ lineId: z.string().min(1) }),
  z.strictObject({
    speaker: characterIdSchema,
    text: z.string().min(1),
  }),
]);
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
export const resolvedDialogueLineSchema = z.strictObject({
  speaker: characterIdSchema,
  text: z.string().min(1),
  lineId: z.string().min(1).optional(),
});
export type ResolvedDialogueLine = z.infer<typeof resolvedDialogueLineSchema>;
export const resolvedNarrationSchema = narrationSchema.extend({
  lines: z.array(resolvedDialogueLineSchema),
});
export type ResolvedNarration = z.infer<typeof resolvedNarrationSchema>;
