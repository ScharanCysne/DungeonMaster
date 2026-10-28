import type {
  BeatProgress,
  BeatResult,
  CharacterId,
  Config,
  EpisodeEnded,
  GameEvent,
  PauseReason,
  PeerRotationState,
  PlayerIntent,
  ResolvedNarration,
} from '@dungeon/shared';
import type { LlmProvider } from '../agents/llm/types.js';
import type { loadEpisode } from '../content/index.js';
import type { Engine } from '../engine/index.js';
import type { EventLog } from '../ontology/eventLog.js';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import type { Clock } from './Clock.js';

export type EpisodeContent = Awaited<ReturnType<typeof loadEpisode>>;
export interface BeatRunnerOptions {
  engine: Engine;
  store: OntologyStore;
  log: EventLog;
  provider: LlmProvider;
  content: EpisodeContent;
  player: CharacterId;
  config: Config;
  clock: Clock;
  onProgress?: (message: BeatProgress) => void;
  onCost?: (cost: number) => void;
}
export interface RunInput {
  beat: number;
  attempt: number;
  intent: PlayerIntent;
  rotation: PeerRotationState;
  recap?: string;
  lastNarration?: ResolvedNarration;
  records: readonly GameEvent[];
}
export interface RunResult {
  result: BeatResult;
  ended?: EpisodeEnded;
  records: GameEvent[];
  rotation: PeerRotationState;
  recap: string | undefined;
  pause?: { reason: PauseReason; error: unknown; projection?: boolean };
}
export type SessionState =
  | { status: 'running' }
  | {
      status: 'paused';
      reason: PauseReason;
      beat: number;
      attempt: number;
      retryAt: number | null;
    }
  | { status: 'ended' };
