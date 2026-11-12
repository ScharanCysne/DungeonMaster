import type {
  BeatProgressPayload,
  BeatTrace,
  CharacterId,
  DebugKind,
  EntityId,
  ErrorMessage,
  Graph,
  ItemId,
  KnowledgeSlice,
  Node,
  PauseReason,
  PlayerIntent,
  Position,
} from '@dungeon/shared';
import type { MapFeedback } from './mapFeedback';

export type Phase = Extract<BeatProgressPayload, { kind: 'status' }>['phase'];
export type MapCue = Extract<BeatProgressPayload, { kind: 'map_cue' }>;
export type BeatState = { number: number } & (
  | { status: 'idle' }
  | {
      status: 'running';
      phase: Phase | null;
      toolCalls: number | null;
      startedAt: number;
    }
  | {
      status: 'paused';
      reason: PauseReason;
      retryInMs: number | null;
      attempt: number;
    }
  | { status: 'ended'; holder: EntityId }
);
export interface WorldState {
  beat: number;
  mapId: string | null;
  entities: Record<string, Node>;
  positions: Record<string, Position>;
  party: CharacterId[];
  inventory: ItemId[];
  gold: number;
  acquiredAt: Record<string, number>;
  equipped: ItemId[];
}
export type JournalEntry = { id: string; beat: number | null } & (
  | { kind: 'beat_header' }
  | { kind: 'intent'; text: string; selection: EntityId[] }
  | {
      kind: 'dialogue';
      speaker: CharacterId;
      text: string;
      status: 'provisional' | 'final' | 'struck';
    }
  | { kind: 'stamp'; text: string; outcome: 'success' | 'failure' | 'tie' }
  | { kind: 'narration'; text: string; traceId?: string }
  | { kind: 'note'; text: string }
  | { kind: 'episode_end'; holder: EntityId; text: string }
);
export interface ClientState {
  connection: {
    status: 'connecting' | 'open' | 'closed';
    retries: number;
    lastSeenBeat: number;
    receivedAt: number;
    error: ErrorMessage | null;
  };
  world: WorldState;
  journal: {
    entries: JournalEntry[];
    reveal: { beat: number; status: 'revealing' | 'complete' } | null;
    scroll: { top: number; following: boolean };
  };
  beat: BeatState;
  mapCues: MapCue[];
  mapFeedback: MapFeedback;
  selection: { ids: EntityId[]; tooMany: boolean };
  composer: {
    text: string;
    history: PlayerIntent[];
    pending: PlayerIntent | null;
  };
  dev: {
    devTools: boolean;
    revision: number;
    beat: number;
    error: ErrorMessage | null;
    traceFocus: string | null;
    previousGraph: Graph | null;
    changes: { nodes: EntityId[]; edges: string[] };
    dmView: boolean;
    inspector: boolean;
    appendixTab: DebugKind | null;
    chosenAgent: CharacterId | null;
    traces: Record<string, BeatTrace>;
    knowledge: Record<string, KnowledgeSlice>;
    graph: Graph | null;
    groundTruth: Graph | null;
  };
}
export function createInitialState(): ClientState {
  return {
    connection: {
      status: 'connecting',
      retries: 0,
      lastSeenBeat: 0,
      receivedAt: 0,
      error: null,
    },
    world: {
      beat: 0,
      mapId: null,
      entities: {},
      positions: {},
      party: [],
      inventory: [],
      gold: 0,
      acquiredAt: {},
      equipped: [],
    },
    journal: { entries: [], reveal: null, scroll: { top: 0, following: true } },
    beat: { status: 'idle', number: 0 },
    mapCues: [],
    mapFeedback: { beat: 0, changed: [], moves: [] },
    selection: { ids: [], tooMany: false },
    composer: { text: '', history: [], pending: null },
    dev: {
      devTools: false,
      revision: 0,
      beat: 0,
      error: null,
      traceFocus: null,
      previousGraph: null,
      changes: { nodes: [], edges: [] },
      dmView: false,
      inspector: false,
      appendixTab: null,
      chosenAgent: null,
      traces: {},
      knowledge: {},
      graph: null,
      groundTruth: null,
    },
  };
}
