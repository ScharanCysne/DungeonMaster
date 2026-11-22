import { z } from 'zod';
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
import { provenanceSchema } from './ontology.js';
import {
  attitudeValueSchema,
  beatSchema,
  confidenceSchema,
  equipmentSlotSchema,
  knowledgeSourceSchema,
} from './primitives.js';

export const edgeSchemas = {
  PART_OF: provenanceSchema.extend({
    type: z.literal('PART_OF'),
    from: locationIdSchema,
    to: locationIdSchema,
    properties: z.strictObject({}),
  }),
  LOCATED_IN: provenanceSchema.extend({
    type: z.literal('LOCATED_IN'),
    from: z.union([characterIdSchema, containerIdSchema, itemIdSchema]),
    to: locationIdSchema,
    properties: z.strictObject({}),
  }),
  CARRIES: provenanceSchema.extend({
    type: z.literal('CARRIES'),
    from: characterIdSchema,
    to: itemIdSchema,
    properties: z.strictObject({}),
  }),
  EQUIPPED: provenanceSchema.extend({
    type: z.literal('EQUIPPED'),
    from: characterIdSchema,
    to: itemIdSchema,
    properties: z.strictObject({ slot: equipmentSlotSchema }),
  }),
  CONTAINS: provenanceSchema.extend({
    type: z.literal('CONTAINS'),
    from: containerIdSchema,
    to: itemIdSchema,
    properties: z.strictObject({}),
  }),
  MEMBER_OF: provenanceSchema.extend({
    type: z.literal('MEMBER_OF'),
    from: characterIdSchema,
    to: factionIdSchema,
    properties: z.strictObject({ rank: z.string().optional() }),
  }),
  ATTITUDE: provenanceSchema.extend({
    type: z.literal('ATTITUDE'),
    from: characterIdSchema,
    to: characterIdSchema,
    properties: z.strictObject({
      value: attitudeValueSchema,
      reason: z.string(),
    }),
  }),
  WANTS: provenanceSchema.extend({
    type: z.literal('WANTS'),
    from: characterIdSchema,
    to: z.union([itemIdSchema, questIdSchema]),
    properties: z.strictObject({ why: z.string() }),
  }),
  PURSUES: provenanceSchema.extend({
    type: z.literal('PURSUES'),
    from: characterIdSchema,
    to: questIdSchema,
    properties: z.strictObject({}),
  }),
  HAS_SECRET: provenanceSchema.extend({
    type: z.literal('HAS_SECRET'),
    from: characterIdSchema,
    to: factIdSchema,
    properties: z.strictObject({}),
  }),
  ABOUT: provenanceSchema.extend({
    type: z.literal('ABOUT'),
    from: factIdSchema,
    to: entityIdSchema,
    properties: z.strictObject({}),
  }),
  ORIGIN_OF: provenanceSchema.extend({
    type: z.literal('ORIGIN_OF'),
    from: factIdSchema,
    to: z.union([itemIdSchema, characterIdSchema]),
    properties: z.strictObject({}),
  }),
  KNOWS: provenanceSchema.extend({
    type: z.literal('KNOWS'),
    from: characterIdSchema,
    to: factIdSchema,
    properties: z.strictObject({
      since: beatSchema,
      source: knowledgeSourceSchema,
      confidence: confidenceSchema,
      retractedAtBeat: beatSchema.optional(),
    }),
  }),
  SUPERSEDES: provenanceSchema.extend({
    type: z.literal('SUPERSEDES'),
    from: factIdSchema,
    to: factIdSchema,
    properties: z.strictObject({}),
  }),
  WITNESSED: provenanceSchema.extend({
    type: z.literal('WITNESSED'),
    from: characterIdSchema,
    to: eventIdSchema,
    properties: z.strictObject({}),
  }),
  INVOLVES: provenanceSchema.extend({
    type: z.literal('INVOLVES'),
    from: eventIdSchema,
    to: entityIdSchema,
    properties: z.strictObject({
      role: z.enum(['actor', 'target', 'item', 'location']),
    }),
  }),
};
export const edgeSchema = z.discriminatedUnion('type', [
  edgeSchemas.PART_OF,
  edgeSchemas.LOCATED_IN,
  edgeSchemas.CARRIES,
  edgeSchemas.EQUIPPED,
  edgeSchemas.CONTAINS,
  edgeSchemas.MEMBER_OF,
  edgeSchemas.ATTITUDE,
  edgeSchemas.WANTS,
  edgeSchemas.PURSUES,
  edgeSchemas.HAS_SECRET,
  edgeSchemas.ABOUT,
  edgeSchemas.ORIGIN_OF,
  edgeSchemas.KNOWS,
  edgeSchemas.SUPERSEDES,
  edgeSchemas.WITNESSED,
  edgeSchemas.INVOLVES,
]);
export type Edge = z.infer<typeof edgeSchema>;
export type EdgeOf<T extends Edge['type']> = Extract<Edge, { type: T }>;
