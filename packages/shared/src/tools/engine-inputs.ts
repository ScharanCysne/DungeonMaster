import { z } from 'zod';
import {
  characterIdSchema,
  containerIdSchema,
  entityIdSchema,
  itemIdSchema,
  locationIdSchema,
} from '../ids.js';
import {
  abilitySchema,
  advantageSchema,
  combatEndReasonSchema,
  dcSchema,
  equipmentSlotSchema,
  healSourceSchema,
  holderIdSchema,
  skillSchema,
  transferReasonSchema,
  unlockMethodSchema,
} from '../primitives.js';

export const checkIdSchema = z.string().min(1);
export type CheckId = z.infer<typeof checkIdSchema>;
export const moveInputSchema = z.strictObject({
  actor: characterIdSchema,
  to: entityIdSchema,
});
export type MoveInput = z.infer<typeof moveInputSchema>;
export const skillCheckInputSchema = z
  .strictObject({
    actor: characterIdSchema,
    skill: skillSchema.optional(),
    ability: abilitySchema.optional(),
    dc: dcSchema,
    advantage: advantageSchema,
    reason: z.string(),
  })
  .refine(
    (input) => (input.skill === undefined) !== (input.ability === undefined),
    { message: 'Provide exactly one of skill or ability' },
  );
export type SkillCheckInput = z.infer<typeof skillCheckInputSchema>;
export const contestedCheckInputSchema = z.strictObject({
  actor: characterIdSchema,
  skill: skillSchema,
  target: characterIdSchema,
  targetSkill: skillSchema,
  reason: z.string(),
});
export type ContestedCheckInput = z.infer<typeof contestedCheckInputSchema>;
export const searchInputSchema = z.strictObject({
  actor: characterIdSchema,
  area: locationIdSchema,
  checkId: checkIdSchema,
});
export type SearchInput = z.infer<typeof searchInputSchema>;
export const openContainerInputSchema = z.strictObject({
  actor: characterIdSchema,
  container: containerIdSchema,
});
export type OpenContainerInput = z.infer<typeof openContainerInputSchema>;
export const unlockContainerInputSchema = z
  .strictObject({
    actor: characterIdSchema,
    container: containerIdSchema,
    method: unlockMethodSchema,
    itemId: itemIdSchema.optional(),
    checkId: checkIdSchema.optional(),
  })
  .superRefine((input, ctx) => {
    const field = input.method === 'key' ? 'itemId' : 'checkId';
    if (input[field] === undefined)
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${input.method} requires ${field}`,
      });
  });
export type UnlockContainerInput = z.infer<typeof unlockContainerInputSchema>;
export const transferItemInputSchema = z
  .strictObject({
    item: itemIdSchema,
    to: holderIdSchema,
    actor: characterIdSchema,
    reason: transferReasonSchema,
    checkId: checkIdSchema.optional(),
    price: z.int().nonnegative().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.reason === 'steal' && input.checkId === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['checkId'],
        message: 'steal requires checkId',
      });
    if (input.reason === 'buy' && input.price === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'buy requires price',
      });
  });
export type TransferItemInput = z.infer<typeof transferItemInputSchema>;
export const equipInputSchema = z.strictObject({
  actor: characterIdSchema,
  item: itemIdSchema,
  slot: equipmentSlotSchema,
});
export type EquipInput = z.infer<typeof equipInputSchema>;
export const unequipInputSchema = equipInputSchema;
export type UnequipInput = z.infer<typeof unequipInputSchema>;
export const hideInputSchema = z.strictObject({
  actor: characterIdSchema,
  checkId: checkIdSchema,
});
export type HideInput = z.infer<typeof hideInputSchema>;
export const attackInputSchema = z.strictObject({
  attacker: characterIdSchema,
  target: characterIdSchema,
  weaponId: itemIdSchema.optional(),
});
export type AttackInput = z.infer<typeof attackInputSchema>;
export const applyDamageInputSchema = z.strictObject({
  target: characterIdSchema,
  dice: z.string().min(1),
  cause: z.string(),
});
export type ApplyDamageInput = z.infer<typeof applyDamageInputSchema>;
export const healInputSchema = z.strictObject({
  target: characterIdSchema,
  dice: z.string().min(1),
  source: healSourceSchema,
});
export type HealInput = z.infer<typeof healInputSchema>;
export const endCombatInputSchema = z.strictObject({
  reason: combatEndReasonSchema,
});
export type EndCombatInput = z.infer<typeof endCombatInputSchema>;
export const passTurnInputSchema = z.strictObject({ actor: characterIdSchema });
export type PassTurnInput = z.infer<typeof passTurnInputSchema>;
