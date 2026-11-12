import { z } from 'zod';
import {
  beatTraceSchema,
  debugKindSchema,
  graphSchema,
  knowledgeSliceSchema,
} from './debug.js';
import { positionSchema } from './event-payloads.js';
import { gameEventSchema } from './events.js';
import { characterIdSchema, entityIdSchema, itemIdSchema } from './ids.js';
import { resolvedNarrationSchema } from './narration.js';
import { nodeSchema } from './ontology.js';
import { beatSchema, rollSchema } from './primitives.js';

export const PROTOCOL_VERSION = 1;
export const helloSchema = z.strictObject({
  type: z.literal('hello'),
  episodeId: z.string().min(1),
  lastSeenBeat: beatSchema.optional(),
});
export type Hello = z.infer<typeof helloSchema>;
export const playerIntentSchema = z.strictObject({
  type: z.literal('player_intent'),
  selection: z.array(entityIdSchema).max(6),
  text: z.string().max(500),
});
export type PlayerIntent = z.infer<typeof playerIntentSchema>;
export const debugRequestSchema = z.strictObject({
  type: z.literal('debug_request'),
  kind: debugKindSchema,
  target: z.string().min(1).optional(),
});
export type DebugRequest = z.infer<typeof debugRequestSchema>;
export const sessionCommandSchema = z.strictObject({
  type: z.literal('session_command'),
  command: z.enum([
    'retry_now',
    'save_and_quit',
    'raise_budget',
    'replay_session',
    'start_new_run',
  ]),
});
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
export const replaySeekSchema = z.strictObject({
  type: z.literal('replay_seek'),
  beat: beatSchema,
});
export type ReplaySeek = z.infer<typeof replaySeekSchema>;
export const clientMessageSchema = z.discriminatedUnion('type', [
  helloSchema,
  playerIntentSchema,
  debugRequestSchema,
  sessionCommandSchema,
  replaySeekSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export const worldSnapshotSchema = z.strictObject({
  type: z.literal('world_snapshot'),
  beat: beatSchema,
  mapId: z.string().min(1),
  entities: z.array(nodeSchema),
  positions: z.array(positionSchema.extend({ entityId: entityIdSchema })),
  party: z.array(characterIdSchema),
  inventory: z.array(itemIdSchema),
  gold: z.int().nonnegative(),
  recentNarration: z.array(resolvedNarrationSchema),
});
export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;
export const beatStartedSchema = z.strictObject({
  type: z.literal('beat_started'),
  beat: beatSchema,
});
export type BeatStarted = z.infer<typeof beatStartedSchema>;
export const beatProgressPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('status'),
    phase: z.enum([
      'peers',
      'dm',
      'npc_voice',
      'critic',
      'dm_retry',
      'committing',
    ]),
    toolCalls: z.int().nonnegative().optional(),
  }),
  z.strictObject({
    kind: z.literal('peer_line'),
    speaker: characterIdSchema,
    text: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('map_cue'),
    entity: characterIdSchema,
    cue: z.enum(['look_at', 'turn', 'glance_up']),
    target: entityIdSchema.optional(),
  }),
]);
export type BeatProgressPayload = z.infer<typeof beatProgressPayloadSchema>;
export const beatProgressSchema = z.strictObject({
  type: z.literal('beat_progress'),
  beat: beatSchema,
  progress: beatProgressPayloadSchema,
});
export type BeatProgress = z.infer<typeof beatProgressSchema>;
export const beatResultSchema = z.strictObject({
  type: z.literal('beat_result'),
  beat: beatSchema,
  events: z.array(gameEventSchema),
  narration: resolvedNarrationSchema,
  rolls: z.array(rollSchema),
  traceId: z.string().min(1),
  groundTruth: graphSchema.optional(),
});
export type BeatResult = z.infer<typeof beatResultSchema>;
export const episodeEndedSchema = z.strictObject({
  type: z.literal('episode_ended'),
  beat: beatSchema,
  holder: entityIdSchema,
  summary: z.string(),
});
export type EpisodeEnded = z.infer<typeof episodeEndedSchema>;
export const replayInfoSchema = z.strictObject({
  type: z.literal('replay_info'),
  sessionId: z.string().min(1),
  beats: beatSchema,
  ended: z.boolean(),
});
export type ReplayInfo = z.infer<typeof replayInfoSchema>;
export const replayStateSchema = z.strictObject({
  type: z.literal('replay_state'),
  snapshot: worldSnapshotSchema,
  results: z.array(beatResultSchema),
  ended: episodeEndedSchema.optional(),
  groundTruth: graphSchema.optional(),
});
export type ReplayState = z.infer<typeof replayStateSchema>;
export const sessionResetSchema = z.strictObject({
  type: z.literal('session_reset'),
  sessionId: z.string().min(1),
});
export const sessionSavedSchema = z.strictObject({
  type: z.literal('session_saved'),
  sessionId: z.string().min(1),
  beat: beatSchema,
});
export const debugResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    type: z.literal('debug_response'),
    kind: z.literal('trace'),
    data: beatTraceSchema,
  }),
  z.strictObject({
    type: z.literal('debug_response'),
    kind: z.literal('knowledge'),
    data: knowledgeSliceSchema,
  }),
  z.strictObject({
    type: z.literal('debug_response'),
    kind: z.literal('graph'),
    data: graphSchema,
  }),
]);
export type DebugResponse = z.infer<typeof debugResponseSchema>;
export const errorMessageSchema = z.strictObject({
  type: z.literal('error'),
  code: z.string().min(1),
  message: z.string().min(1),
});
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export const pauseReasonSchema = z.enum([
  'llm_unavailable',
  'graph_unavailable',
  'internal_error',
  'budget',
]);
export type PauseReason = z.infer<typeof pauseReasonSchema>;
export const pausedSchema = z.strictObject({
  type: z.literal('paused'),
  reason: pauseReasonSchema,
  beat: beatSchema,
  attempt: z.int().nonnegative(),
  retryInMs: z.int().nonnegative().nullable(),
  budgetStepUsd: z.number().positive().optional(),
  errorCode: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
});
export type Paused = z.infer<typeof pausedSchema>;
export const resumedSchema = z.strictObject({
  type: z.literal('resumed'),
  beat: beatSchema,
});
export type Resumed = z.infer<typeof resumedSchema>;
export const serverMessageSchema = z.discriminatedUnion('type', [
  worldSnapshotSchema,
  beatStartedSchema,
  beatProgressSchema,
  beatResultSchema,
  episodeEndedSchema,
  debugResponseSchema,
  errorMessageSchema,
  pausedSchema,
  resumedSchema,
  replayInfoSchema,
  replayStateSchema,
  sessionResetSchema,
  sessionSavedSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
