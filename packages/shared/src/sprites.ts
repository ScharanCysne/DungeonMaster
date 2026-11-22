import { z } from 'zod';
import { characterIdSchema, containerIdSchema, itemIdSchema } from './ids.js';
import { itemKindSchema } from './primitives.js';

export const spriteFrameSchema = z
  .string()
  .regex(/^kenney-1-bit:(0|[1-9]\d*)$/)
  .refine((frame) => Number(frame.split(':')[1]) < 1078, {
    message: 'Kenney 1-Bit frame must be between 0 and 1077.',
  });
export type SpriteFrame = z.infer<typeof spriteFrameSchema>;

export const spriteManifestSchema = z.strictObject({
  tags: z.record(z.string().min(1), spriteFrameSchema),
  fallbacks: z.record(
    z.enum(['npc', 'item', 'container', ...itemKindSchema.options]),
    spriteFrameSchema,
  ),
  overrides: z.record(
    z.union([characterIdSchema, containerIdSchema, itemIdSchema]),
    spriteFrameSchema,
  ),
});
export type SpriteManifest = z.infer<typeof spriteManifestSchema>;
