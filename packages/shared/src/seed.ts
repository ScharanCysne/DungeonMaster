import { z } from 'zod';
import {
  characterIdSchema,
  entityIdSchema,
  factIdSchema,
  locationIdSchema,
} from './ids.js';
import {
  characterSchema,
  containerSchema,
  factSchema,
  factionSchema,
  itemSchema,
  locationSchema,
  questSchema,
} from './ontology.js';
import {
  attitudeValueSchema,
  confidenceSchema,
  holderSchema,
  tileSchema,
} from './primitives.js';

const seedFields = { createdBy: true, createdAtBeat: true } as const;
export const seedLocationSchema = locationSchema.omit(seedFields).extend({
  partOf: locationIdSchema.optional(),
  lit: z.boolean().default(true),
});
export type SeedLocation = z.infer<typeof seedLocationSchema>;
export const seedCharacterSchema = characterSchema.omit(seedFields).extend({
  tile: tileSchema,
  location: locationIdSchema,
  conscious: z.boolean().default(true),
  hidden: z.boolean().default(false),
});
export type SeedCharacter = z.infer<typeof seedCharacterSchema>;
export const seedContainerSchema = containerSchema.omit(seedFields).extend({
  location: locationIdSchema,
  opened: z.boolean().default(false),
});
export type SeedContainer = z.infer<typeof seedContainerSchema>;
export const seedItemSchema = itemSchema
  .omit(seedFields)
  .extend({ holder: holderSchema });
export type SeedItem = z.infer<typeof seedItemSchema>;
export const seedKnowledgeSchema = z.strictObject({
  character: characterIdSchema,
  confidence: confidenceSchema,
});
export type SeedKnowledge = z.infer<typeof seedKnowledgeSchema>;
// The seed fragment omits display metadata for facts; the loader will supply it.
export const seedFactSchema = factSchema.omit(seedFields).extend({
  name: z.string().min(1).optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  about: z.array(entityIdSchema),
  knownBy: z.array(seedKnowledgeSchema),
});
export type SeedFact = z.infer<typeof seedFactSchema>;
const seedQuestBase = questSchema
  .omit(seedFields)
  .extend({ status: questSchema.shape.status.default('active') });
export const seedQuestSchema = z.discriminatedUnion('kind', [
  seedQuestBase.extend({ kind: z.literal('episode') }),
  seedQuestBase.extend({
    kind: z.literal('personal'),
    pursuedBy: characterIdSchema,
  }),
]);
export type SeedQuest = z.infer<typeof seedQuestSchema>;
export const seedFactionMemberSchema = z.strictObject({
  character: characterIdSchema,
  rank: z.string().optional(),
});
export type SeedFactionMember = z.infer<typeof seedFactionMemberSchema>;
export const seedFactionSchema = factionSchema
  .omit(seedFields)
  .extend({ members: z.array(seedFactionMemberSchema) });
export type SeedFaction = z.infer<typeof seedFactionSchema>;
export const seedAttitudeSchema = z.strictObject({
  from: characterIdSchema,
  to: characterIdSchema,
  value: attitudeValueSchema,
  reason: z.string(),
});
export type SeedAttitude = z.infer<typeof seedAttitudeSchema>;
export const seedSecretSchema = z.strictObject({
  character: characterIdSchema,
  fact: factIdSchema,
});
export type SeedSecret = z.infer<typeof seedSecretSchema>;
export const episodeSeedSchema = z.strictObject({
  episodeId: z.string().min(1),
  mapId: z.string().min(1),
  locations: z.array(seedLocationSchema),
  characters: z.array(seedCharacterSchema),
  containers: z.array(seedContainerSchema),
  items: z.array(seedItemSchema),
  facts: z.array(seedFactSchema),
  quests: z.array(seedQuestSchema),
  factions: z.array(seedFactionSchema),
  attitudes: z.array(seedAttitudeSchema),
  secrets: z.array(seedSecretSchema),
});
export type EpisodeSeed = z.infer<typeof episodeSeedSchema>;
export { validateSeedReferences } from './seed-references.js';
