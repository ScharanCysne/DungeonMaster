import { z } from 'zod';
import { criticIssueSchema } from './agents.js';
import { edgeSchema } from './edges.js';
import {
  characterIdSchema,
  containerIdSchema,
  entityIdSchema,
  factIdSchema,
  itemIdSchema,
  locationIdSchema,
  questIdSchema,
} from './ids.js';
import { narrationSchema, resolvedNarrationSchema } from './narration.js';
import { factSchema, nodeSchema } from './ontology.js';
import {
  abilitySchema,
  advantageSchema,
  attitudeValueSchema,
  beatSchema,
  combatEndReasonSchema,
  confidenceSchema,
  dcSchema,
  equipmentSlotSchema,
  healSourceSchema,
  holderSchema,
  knowledgeSourceSchema,
  questStatusSchema,
  rollSchema,
  skillSchema,
  tileSchema,
  transferReasonSchema,
  unlockMethodSchema,
} from './primitives.js';
import { episodeSeedSchema } from './seed.js';

export const positionSchema = z.strictObject({
  locationId: locationIdSchema,
  tile: tileSchema,
});
export type Position = z.infer<typeof positionSchema>;
export const goldChangeSchema = z.strictObject({
  characterId: characterIdSchema,
  gold: z.int().nonnegative(),
});
export type GoldChange = z.infer<typeof goldChangeSchema>;
export const checkRolledPayloadSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('skill'),
      checkId: z.string().min(1),
      actor: characterIdSchema,
      skill: skillSchema.optional(),
      ability: abilitySchema.optional(),
      dc: dcSchema,
      advantage: advantageSchema,
      reason: z.string(),
      roll: rollSchema,
    })
    .refine(
      (check) => (check.skill === undefined) !== (check.ability === undefined),
      { message: 'Provide exactly one of skill or ability' },
    ),
  z.strictObject({
    kind: z.literal('contested'),
    checkId: z.string().min(1),
    actor: characterIdSchema,
    skill: skillSchema,
    target: characterIdSchema,
    targetSkill: skillSchema,
    reason: z.string(),
    actorRoll: rollSchema,
    targetRoll: rollSchema,
    winner: characterIdSchema.nullable(),
  }),
]);
export type CheckRolledPayload = z.infer<typeof checkRolledPayloadSchema>;

export const eventPayloadSchemas = {
  SeedLoaded: z.strictObject({
    seed: episodeSeedSchema,
    rngSeed: z.string().min(1),
  }),
  BeatStarted: z.strictObject({ attempt: z.int().nonnegative() }),
  IntentReceived: z.strictObject({
    selection: z.array(entityIdSchema),
    text: z.string(),
    say: z.string().optional(),
  }),
  EntityMoved: z.strictObject({
    entityId: entityIdSchema,
    from: locationIdSchema,
    to: locationIdSchema,
    tile: tileSchema,
    path: z.array(tileSchema).min(1),
  }),
  ItemTransferred: z.strictObject({
    itemId: itemIdSchema,
    from: holderSchema,
    to: holderSchema,
    reason: transferReasonSchema,
    goldChanges: z.array(goldChangeSchema),
  }),
  ItemEquipped: z.strictObject({
    characterId: characterIdSchema,
    itemId: itemIdSchema,
    slot: equipmentSlotSchema,
  }),
  ItemUnequipped: z.strictObject({
    characterId: characterIdSchema,
    itemId: itemIdSchema,
    slot: equipmentSlotSchema,
  }),
  ContainerOpened: z.strictObject({
    containerId: containerIdSchema,
    revealed: z.array(itemIdSchema),
  }),
  ContainerUnlocked: z.strictObject({
    containerId: containerIdSchema,
    method: unlockMethodSchema,
    revealed: z.array(itemIdSchema),
  }),
  EntityRevealed: z.strictObject({ entityId: entityIdSchema }),
  EntityHidden: z.strictObject({ entityId: entityIdSchema }),
  CheckRolled: checkRolledPayloadSchema,
  AttackResolved: z.strictObject({
    attacker: characterIdSchema,
    target: characterIdSchema,
    weaponId: itemIdSchema.optional(),
    roll: rollSchema,
    hit: z.boolean(),
    critical: z.boolean(),
  }),
  DamageApplied: z.strictObject({
    target: characterIdSchema,
    amount: z.int().nonnegative(),
    hp: z.int().nonnegative(),
    conscious: z.boolean(),
    roll: rollSchema,
    cause: z.string(),
  }),
  Healed: z.strictObject({
    target: characterIdSchema,
    amount: z.int().nonnegative(),
    hp: z.int().nonnegative(),
    conscious: z.boolean(),
    roll: rollSchema,
    source: healSourceSchema,
  }),
  CombatStarted: z.strictObject({
    order: z.array(characterIdSchema).min(1),
    turn: z.int().nonnegative(),
    round: z.int().positive(),
    initiative: z
      .array(
        z.strictObject({ characterId: characterIdSchema, roll: rollSchema }),
      )
      .min(1),
  }),
  CombatEnded: z.strictObject({ reason: combatEndReasonSchema }),
  EntityCreated: z.strictObject({
    entity: nodeSchema,
    edges: z.array(edgeSchema),
    position: positionSchema.optional(),
  }),
  FactCreated: z.strictObject({
    fact: factSchema,
    about: z.array(entityIdSchema),
    originOf: z.array(z.union([itemIdSchema, characterIdSchema])),
  }),
  FactLearned: z.strictObject({
    characterId: characterIdSchema,
    factId: factIdSchema,
    since: beatSchema,
    source: knowledgeSourceSchema,
    confidence: confidenceSchema,
  }),
  AttitudeChanged: z.strictObject({
    from: characterIdSchema,
    to: characterIdSchema,
    value: attitudeValueSchema,
    delta: z.int().min(-30).max(30),
    reason: z.string(),
  }),
  QuestStatusChanged: z.strictObject({
    questId: questIdSchema,
    status: questStatusSchema,
  }),
  NarrationCommitted: resolvedNarrationSchema,
  CriticRejected: z.strictObject({
    issues: z.array(criticIssueSchema).min(1),
    narration: narrationSchema,
  }),
  RecapUpdated: z.strictObject({ text: z.string() }),
  EpisodeEnded: z.strictObject({
    holder: characterIdSchema,
    questId: questIdSchema,
    summary: z.string(),
  }),
  BeatCommitted: z.strictObject({}),
};
export type EventPayload<T extends keyof typeof eventPayloadSchemas> = z.infer<
  (typeof eventPayloadSchemas)[T]
>;
