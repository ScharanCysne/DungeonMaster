import { z } from 'zod';
import { gameEventSchema } from './events.js';
import { narrationSchema } from './narration.js';
import * as engine from './tools/engine-inputs.js';
import * as soft from './tools/soft-inputs.js';
import * as generator from './tools/generator-inputs.js';
import * as generated from './tools/generator-outputs.js';
import * as output from './tools/outputs.js';

export function toolResultSchema<S extends z.ZodType>(value: S) {
  return z.discriminatedUnion('ok', [
    z.strictObject({
      ok: z.literal(true),
      value,
      events: z.array(gameEventSchema),
      facts: z.array(z.string()),
    }),
    z.strictObject({
      ok: z.literal(false),
      error: z.strictObject({
        code: z.string().min(1),
        message: z.string().min(1),
      }),
    }),
  ]);
}
export type ToolResult<T> = z.infer<
  ReturnType<typeof toolResultSchema<z.ZodType<T>>>
>;
export const narrateInputSchema = narrationSchema;
export type NarrateInput = z.infer<typeof narrateInputSchema>;
export const narrateOutputSchema = narrationSchema;
export type NarrateOutput = z.infer<typeof narrateOutputSchema>;
export const toolSchemas = {
  move: { input: engine.moveInputSchema, output: output.moveOutputSchema },
  skill_check: {
    input: engine.skillCheckInputSchema,
    output: output.skillCheckOutputSchema,
  },
  contested_check: {
    input: engine.contestedCheckInputSchema,
    output: output.contestedCheckOutputSchema,
  },
  search: {
    input: engine.searchInputSchema,
    output: output.searchOutputSchema,
  },
  open_container: {
    input: engine.openContainerInputSchema,
    output: output.openContainerOutputSchema,
  },
  unlock_container: {
    input: engine.unlockContainerInputSchema,
    output: output.unlockContainerOutputSchema,
  },
  transfer_item: {
    input: engine.transferItemInputSchema,
    output: output.transferItemOutputSchema,
  },
  equip: { input: engine.equipInputSchema, output: output.equipOutputSchema },
  unequip: {
    input: engine.unequipInputSchema,
    output: output.unequipOutputSchema,
  },
  hide: { input: engine.hideInputSchema, output: output.hideOutputSchema },
  attack: {
    input: engine.attackInputSchema,
    output: output.attackOutputSchema,
  },
  apply_damage: {
    input: engine.applyDamageInputSchema,
    output: output.applyDamageOutputSchema,
  },
  heal: { input: engine.healInputSchema, output: output.healOutputSchema },
  end_combat: {
    input: engine.endCombatInputSchema,
    output: output.endCombatOutputSchema,
  },
  set_attitude: {
    input: soft.setAttitudeInputSchema,
    output: output.setAttitudeOutputSchema,
  },
  share_fact: {
    input: soft.shareFactInputSchema,
    output: output.shareFactOutputSchema,
  },
  create_fact: {
    input: soft.createFactInputSchema,
    output: output.createFactOutputSchema,
  },
  set_quest_status: {
    input: soft.setQuestStatusInputSchema,
    output: output.setQuestStatusOutputSchema,
  },
  generate_item: {
    input: generator.generateItemInputSchema,
    output: generated.generateItemOutputSchema,
  },
  generate_npc: {
    input: generator.generateNpcInputSchema,
    output: generated.generateNpcOutputSchema,
  },
  generate_feature: {
    input: generator.generateFeatureInputSchema,
    output: generated.generateFeatureOutputSchema,
  },
  generate_story: {
    input: generator.generateStoryInputSchema,
    output: generated.generateStoryOutputSchema,
  },
  narrate: { input: narrateInputSchema, output: narrateOutputSchema },
};
export * from './tools/engine-inputs.js';
export * from './tools/soft-inputs.js';
export * from './tools/generator-inputs.js';
export * from './tools/generated.js';
export * from './tools/generator-outputs.js';
export * from './tools/outputs.js';
export * from './agents.js';
