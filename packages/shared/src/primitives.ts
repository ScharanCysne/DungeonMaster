import { z } from 'zod';
import {
  characterIdSchema,
  containerIdSchema,
  itemIdSchema,
  locationIdSchema,
} from './ids.js';

export const beatSchema = z.int().nonnegative();
export type Beat = z.infer<typeof beatSchema>;
export const createdBySchema = z.enum([
  'seed',
  'engine',
  'dm',
  'generator:item',
  'generator:npc',
  'generator:story',
  'generator:feature',
]);
export type CreatedBy = z.infer<typeof createdBySchema>;
export const abilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type Ability = z.infer<typeof abilitySchema>;
export const skillSchema = z.enum([
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
]);
export type Skill = z.infer<typeof skillSchema>;
export const abilitiesSchema = z.strictObject({
  str: z.int().min(3).max(20),
  dex: z.int().min(3).max(20),
  con: z.int().min(3).max(20),
  int: z.int().min(3).max(20),
  wis: z.int().min(3).max(20),
  cha: z.int().min(3).max(20),
});
export type Abilities = z.infer<typeof abilitiesSchema>;
export const dcSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
  z.literal(25),
]);
export type Dc = z.infer<typeof dcSchema>;
export const advantageSchema = z.enum(['none', 'advantage', 'disadvantage']);
export type Advantage = z.infer<typeof advantageSchema>;
export const characterRoleSchema = z.enum(['player', 'peer', 'npc']);
export type CharacterRole = z.infer<typeof characterRoleSchema>;
export const raritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'very_rare',
  'legendary',
]);
export type Rarity = z.infer<typeof raritySchema>;
export const itemKindSchema = z.enum([
  'weapon',
  'armor',
  'tool',
  'trinket',
  'document',
  'consumable',
  'treasure',
]);
export type ItemKind = z.infer<typeof itemKindSchema>;
export const locationKindSchema = z.enum(['building', 'room', 'spot']);
export type LocationKind = z.infer<typeof locationKindSchema>;
export const factKindSchema = z.enum([
  'lore',
  'rumour',
  'secret',
  'observation',
  'backstory',
]);
export type FactKind = z.infer<typeof factKindSchema>;
export const factTruthSchema = z.union([z.boolean(), z.literal('unknown')]);
export type FactTruth = z.infer<typeof factTruthSchema>;
export const questKindSchema = z.enum(['episode', 'personal']);
export type QuestKind = z.infer<typeof questKindSchema>;
export const questStatusSchema = z.enum([
  'active',
  'complete',
  'failed',
  'abandoned',
]);
export type QuestStatus = z.infer<typeof questStatusSchema>;
export const equipmentSlotSchema = z.enum([
  'main_hand',
  'off_hand',
  'armor',
  'accessory',
]);
export type EquipmentSlot = z.infer<typeof equipmentSlotSchema>;
export const tileSchema = z.strictObject({ x: z.int(), y: z.int() });
export type Tile = z.infer<typeof tileSchema>;
export const tileBoundsSchema = tileSchema.extend({
  w: z.int().positive(),
  h: z.int().positive(),
});
export type TileBounds = z.infer<typeof tileBoundsSchema>;
export const confidenceSchema = z.number().min(0).max(1);
export type Confidence = z.infer<typeof confidenceSchema>;
export const attitudeValueSchema = z.int().min(-100).max(100);
export type AttitudeValue = z.infer<typeof attitudeValueSchema>;
export const knowledgeSourceSchema = z.enum([
  'seed',
  'witnessed',
  'told',
  'deduced',
  'read',
]);
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export const transferReasonSchema = z.enum([
  'pick_up',
  'give',
  'drop',
  'steal',
  'buy',
  'loot',
]);
export type TransferReason = z.infer<typeof transferReasonSchema>;
export const unlockMethodSchema = z.enum(['key', 'lockpick', 'force']);
export type UnlockMethod = z.infer<typeof unlockMethodSchema>;
export const combatEndReasonSchema = z.enum([
  'fled',
  'surrendered',
  'defeated',
  'talked_down',
]);
export type CombatEndReason = z.infer<typeof combatEndReasonSchema>;
export const holderSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('character'), id: characterIdSchema }),
  z.strictObject({ kind: z.literal('container'), id: containerIdSchema }),
  z.strictObject({ kind: z.literal('location'), id: locationIdSchema }),
]);
export type Holder = z.infer<typeof holderSchema>;
export const holderIdSchema = z.union([
  characterIdSchema,
  containerIdSchema,
  locationIdSchema,
]);
export type HolderId = z.infer<typeof holderIdSchema>;
// A check receipt covers the cleric's narrative healing ability (Rules summary: spells resolve with a check).
export const healSourceSchema = z.union([
  itemIdSchema,
  z.literal('rest'),
  z.strictObject({ checkId: z.string().min(1) }),
]);
export type HealSource = z.infer<typeof healSourceSchema>;
export const rollOutcomeSchema = z.enum(['success', 'failure', 'tie']);
export type RollOutcome = z.infer<typeof rollOutcomeSchema>;
export const rollSchema = z.strictObject({
  expr: z.string().min(1),
  rolls: z.array(z.int().positive()),
  total: z.int(),
  dc: z.int().optional(),
  outcome: rollOutcomeSchema,
});
export type Roll = z.infer<typeof rollSchema>;
export const eventTypeSchema = z.enum([
  'SeedLoaded',
  'BeatStarted',
  'IntentReceived',
  'EntityMoved',
  'ItemTransferred',
  'ItemEquipped',
  'ItemUnequipped',
  'ContainerOpened',
  'ContainerUnlocked',
  'EntityRevealed',
  'EntityHidden',
  'CheckRolled',
  'AttackResolved',
  'DamageApplied',
  'Healed',
  'CombatStarted',
  'CombatEnded',
  'TurnAdvanced',
  'EntityCreated',
  'FactCreated',
  'FactLearned',
  'AttitudeChanged',
  'QuestStatusChanged',
  'NarrationCommitted',
  'CriticRejected',
  'RecapUpdated',
  'EpisodeEnded',
  'BeatCommitted',
]);
export type EventType = z.infer<typeof eventTypeSchema>;
