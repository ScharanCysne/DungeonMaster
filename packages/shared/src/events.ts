import { z } from 'zod';
import { characterIdSchema } from './ids.js';
import { beatSchema, createdBySchema } from './primitives.js';
import { eventPayloadSchemas as payloads } from './event-payloads.js';

export const eventEnvelopeSchema = z.strictObject({
  v: z.literal(1),
  sessionId: z.string().min(1),
  beat: beatSchema,
  seq: z.int().nonnegative(),
  actor: characterIdSchema.nullable(),
  private: z.boolean(),
  witnesses: z.array(characterIdSchema),
  createdBy: createdBySchema,
  traceId: z.string().min(1),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
function record<T extends keyof typeof payloads>(type: T) {
  return eventEnvelopeSchema.extend({
    type: z.literal(type),
    payload: payloads[type],
  });
}
export const gameEventSchema = z.discriminatedUnion('type', [
  record('SeedLoaded'),
  record('BeatStarted'),
  record('IntentReceived'),
  record('EntityMoved'),
  record('ItemTransferred'),
  record('ItemEquipped'),
  record('ItemUnequipped'),
  record('ContainerOpened'),
  record('ContainerUnlocked'),
  record('EntityRevealed'),
  record('EntityHidden'),
  record('CheckRolled'),
  record('AttackResolved'),
  record('DamageApplied'),
  record('Healed'),
  record('CombatStarted'),
  record('CombatEnded'),
  record('TurnAdvanced'),
  record('EntityCreated'),
  record('FactCreated'),
  record('FactLearned'),
  record('AttitudeChanged'),
  record('QuestStatusChanged'),
  record('NarrationCommitted'),
  record('CriticRejected'),
  record('RecapUpdated'),
  record('EpisodeEnded'),
  record('BeatCommitted'),
]);
export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameEventOf<T extends GameEvent['type']> = Extract<
  GameEvent,
  { type: T }
>;
export { rollSchema } from './primitives.js';
export type { Roll } from './primitives.js';
export { eventPayloadSchemas } from './event-payloads.js';
