import { z } from 'zod';
import { characterIdSchema, entityIdSchema, factIdSchema } from '../ids.js';
import { eventPayloadSchemas as payloads } from '../event-payloads.js';
import { rollOutcomeSchema, rollSchema } from '../primitives.js';

export const moveOutputSchema = payloads.EntityMoved;
export type MoveOutput = z.infer<typeof moveOutputSchema>;
export const skillCheckOutputSchema = z.strictObject({
  checkId: z.string().min(1),
  total: z.int(),
  outcome: rollOutcomeSchema,
  roll: rollSchema,
});
export type SkillCheckOutput = z.infer<typeof skillCheckOutputSchema>;
export const contestedCheckOutputSchema = z.strictObject({
  checkId: z.string().min(1),
  winner: characterIdSchema.nullable(),
  actorRoll: rollSchema,
  targetRoll: rollSchema,
});
export type ContestedCheckOutput = z.infer<typeof contestedCheckOutputSchema>;
export const searchOutputSchema = z.strictObject({
  revealed: z.array(entityIdSchema),
});
export type SearchOutput = z.infer<typeof searchOutputSchema>;
export const openContainerOutputSchema = payloads.ContainerOpened;
export type OpenContainerOutput = z.infer<typeof openContainerOutputSchema>;
export const unlockContainerOutputSchema = payloads.ContainerUnlocked;
export type UnlockContainerOutput = z.infer<typeof unlockContainerOutputSchema>;
export const transferItemOutputSchema = payloads.ItemTransferred;
export type TransferItemOutput = z.infer<typeof transferItemOutputSchema>;
export const equipOutputSchema = payloads.ItemEquipped;
export type EquipOutput = z.infer<typeof equipOutputSchema>;
export const unequipOutputSchema = payloads.ItemUnequipped;
export type UnequipOutput = z.infer<typeof unequipOutputSchema>;
export const hideOutputSchema = payloads.EntityHidden;
export type HideOutput = z.infer<typeof hideOutputSchema>;
export const attackOutputSchema = payloads.AttackResolved;
export type AttackOutput = z.infer<typeof attackOutputSchema>;
export const applyDamageOutputSchema = payloads.DamageApplied;
export type ApplyDamageOutput = z.infer<typeof applyDamageOutputSchema>;
export const healOutputSchema = payloads.Healed;
export type HealOutput = z.infer<typeof healOutputSchema>;
export const endCombatOutputSchema = payloads.CombatEnded;
export type EndCombatOutput = z.infer<typeof endCombatOutputSchema>;
export const setAttitudeOutputSchema = payloads.AttitudeChanged;
export type SetAttitudeOutput = z.infer<typeof setAttitudeOutputSchema>;
export const shareFactOutputSchema = z.strictObject({
  learned: z.array(payloads.FactLearned),
});
export type ShareFactOutput = z.infer<typeof shareFactOutputSchema>;
export const createFactOutputSchema = z.strictObject({ factId: factIdSchema });
export type CreateFactOutput = z.infer<typeof createFactOutputSchema>;
export const setQuestStatusOutputSchema = payloads.QuestStatusChanged;
export type SetQuestStatusOutput = z.infer<typeof setQuestStatusOutputSchema>;
