import { z } from 'zod';
import { entityIdSchema } from './ids.js';

export const peerTurnSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pass') }),
  z.strictObject({
    kind: z.literal('intent'),
    text: z.string(),
    refs: z.array(entityIdSchema),
    say: z.string().optional(),
    private: z.boolean(),
  }),
]);
export type PeerTurn = z.infer<typeof peerTurnSchema>;
export const criticIssueTypeSchema = z.enum([
  'state_contradiction',
  'unbacked_outcome',
  'invented_content',
  'perspective_leak',
  'npc_knowledge_leak',
  'lore_contradiction',
  'temporal_contradiction',
]);
export type CriticIssueType = z.infer<typeof criticIssueTypeSchema>;
export const criticIssueSchema = z.strictObject({
  type: criticIssueTypeSchema,
  quote: z.string(),
  explanation: z.string(),
});
export type CriticIssue = z.infer<typeof criticIssueSchema>;
export const criticVerdictSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    issues: z.array(criticIssueSchema).min(1),
  }),
]);
export type CriticVerdict = z.infer<typeof criticVerdictSchema>;
export const modelRoleSchema = z.enum([
  'dm',
  'peer',
  'npc_voice',
  'generator',
  'story',
  'critic',
  'recap',
]);
export type ModelRole = z.infer<typeof modelRoleSchema>;
