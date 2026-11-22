import { z } from 'zod';
import {
  characterIdSchema,
  criticVerdictSchema,
  factIdSchema,
} from '@dungeon/shared';

export const selfLeakSchema = z.strictObject({
  speaker: characterIdSchema,
  factId: factIdSchema,
  quote: z.string().min(1),
});
export type SelfLeak = z.infer<typeof selfLeakSchema>;

export const criticOutputSchema = z.strictObject({
  claims: z.array(z.strictObject({ quote: z.string(), evidence: z.string() })),
  verdict: criticVerdictSchema,
  selfLeaks: z.array(selfLeakSchema),
});
export type CriticOutput = z.infer<typeof criticOutputSchema>;
