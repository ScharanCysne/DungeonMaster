import { z } from 'zod';
import {
  criticVerdictSchema,
  modelRoleSchema,
  peerTurnSchema,
} from './agents.js';
import { edgeSchema, edgeSchemas } from './edges.js';
import { gameEventSchema } from './events.js';
import { characterIdSchema, entityIdSchema } from './ids.js';
import {
  characterSchema,
  eventNodeSchema,
  factSchema,
  itemSchema,
  nodeSchema,
  questSchema,
} from './ontology.js';
import { beatSchema } from './primitives.js';

export const graphSchema = z.strictObject({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});
export type Graph = z.infer<typeof graphSchema>;
export const knowledgeSliceSchema = z.strictObject({
  character: characterSchema,
  facts: z.array(
    z.strictObject({ fact: factSchema, knowledge: edgeSchemas.KNOWS }),
  ),
  events: z.array(eventNodeSchema),
  visible: z.array(nodeSchema),
  attitudes: z.array(edgeSchemas.ATTITUDE),
  quests: z.array(questSchema),
  secrets: z.array(factSchema),
  inventory: z.array(itemSchema),
});
export type KnowledgeSlice = z.infer<typeof knowledgeSliceSchema>;
export const tokenUsageSchema = z.strictObject({
  input: z.int().nonnegative(),
  output: z.int().nonnegative(),
  cacheWrite: z.int().nonnegative(),
  cacheRead: z.int().nonnegative(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export const traceCallSchema = z.strictObject({
  role: modelRoleSchema,
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  request: z.json(),
  response: z.json(),
  usage: tokenUsageSchema,
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type TraceCall = z.infer<typeof traceCallSchema>;
export const beatTraceSchema = z.strictObject({
  traceId: z.string().min(1),
  beat: beatSchema,
  attempt: z.int().nonnegative(),
  intents: z.array(
    z.strictObject({
      actor: characterIdSchema,
      selection: z.array(entityIdSchema),
      text: z.string(),
      private: z.boolean(),
    }),
  ),
  peerTurns: z.array(
    z.strictObject({ actor: characterIdSchema, turn: peerTurnSchema }),
  ),
  calls: z.array(traceCallSchema),
  events: z.array(gameEventSchema),
  critic: criticVerdictSchema.optional(),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  outcome: z.enum(['committed', 'fallback', 'aborted']),
});
export type BeatTrace = z.infer<typeof beatTraceSchema>;
export const debugKindSchema = z.enum(['trace', 'knowledge', 'graph']);
export type DebugKind = z.infer<typeof debugKindSchema>;
