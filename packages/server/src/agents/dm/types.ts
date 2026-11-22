import type {
  CharacterId,
  EntityId,
  EventNode,
  KnowledgeSlice,
  PeerTurn,
  PlayerIntent,
  ResolvedNarration,
} from '@dungeon/shared';
import type { CombatState } from '../../engine/state.js';
import type { DMContext } from '../../ontology/queries/dm.js';
import type { SelectionContext } from '../../ontology/queries/selection.js';
import type { LlmUsage, TokenUsage } from '../llm/types.js';

export interface DmIntents {
  player: Pick<PlayerIntent, 'selection' | 'text'>;
  peers: { actor: CharacterId; turn: PeerTurn }[];
}

export interface DmContextData {
  state: DMContext;
  combat: CombatState | null;
  npcs: KnowledgeSlice[];
  neighbours: SelectionContext;
  narrations: EventNode[];
  intents: DmIntents;
}

export interface DroppedContext {
  events: EntityId[];
  neighbours: EntityId[];
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  targetTokens: number;
  overBudget: boolean;
}

export type DmToolCall = {
  name: string;
  input: unknown;
} & ({ ok: true } | { ok: false; error: { code: string; message: string } });

export interface DmIterationUsage {
  // One-based provider turn across the initial loop, recovery and critic retry.
  iteration: number;
  // A refusal without a provider response has no reported usage.
  usage: LlmUsage | null;
}

export interface DmBeatResult {
  status: 'narrated' | 'noNarration' | 'refused';
  narration: ResolvedNarration | undefined;
  toolCalls: DmToolCall[];
  iterations: number;
  iterationUsage: DmIterationUsage[];
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  fallbackUsed: boolean;
  droppedContext: DroppedContext;
}
