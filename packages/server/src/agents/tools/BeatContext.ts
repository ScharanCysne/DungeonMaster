import { defaultConfig } from '@dungeon/shared';
import type {
  CharacterId,
  Config,
  CreatedBy,
  Fact,
  ResolvedNarration,
} from '@dungeon/shared';
import type { Engine } from '../../engine/index.js';
import { envelopeDrafts } from '../../ontology/eventLog.js';
import type { LogDraft } from '../../ontology/eventLog.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import type { OntologyStore } from '../../ontology/OntologyStore.js';
import { project } from '../../ontology/projector.js';
import type { Generators, NpcVoice } from './types.js';

export type BeatEventDraft = LogDraft & { createdBy: CreatedBy };
export interface SpokenLine {
  speaker: CharacterId;
  text: string;
}
interface Options {
  engine: Engine;
  store: OntologyStore;
  generators: Generators;
  npcVoice: NpcVoice;
  config?: Config;
  peerSayLines?: readonly SpokenLine[];
}

export class BeatContext {
  readonly engine: Engine;
  readonly store: OntologyStore;
  readonly config: Config;
  readonly generators: Generators;
  readonly npcVoice: NpcVoice;
  readonly peerSayLines: readonly SpokenLine[];
  readonly voicedLines = new Map<string, SpokenLine>();
  readonly counters = { toolCalls: 0, generatorCalls: 0, voiceNpcCalls: 0 };
  readonly storyFacts: { facts: Fact[]; basedOn: Fact[] }[] = [];
  narration: ResolvedNarration | undefined;
  finished = false;
  #events: BeatEventDraft[] = [];
  #engineSlots: number[] = [];
  #retryToolCallLimit: number | undefined;

  constructor(options: Options) {
    this.engine = options.engine;
    this.store = options.store;
    this.config = options.config ?? defaultConfig;
    this.generators = options.generators;
    this.npcVoice = options.npcVoice;
    this.peerSayLines = structuredClone(options.peerSayLines ?? []);
    this.collectEngineEvents();
  }

  get beat() {
    return this.engine.state.beat;
  }
  get limits() {
    return this.config.limits;
  }
  get toolCallLimit() {
    return this.#retryToolCallLimit ?? this.limits.toolCalls;
  }

  beginNarrationRetry(allowStateChanges: boolean): void {
    if (this.#retryToolCallLimit !== undefined)
      throw new Error('Only one narration retry is allowed per beat.');
    const extra = allowStateChanges
      ? Math.min(2, this.limits.retryToolCallsForUnbackedOutcome)
      : 0;
    // Preserve counters and buffered events; only the rejected proposal is cleared.
    this.#retryToolCallLimit = this.counters.toolCalls + extra;
    this.narration = undefined;
    this.finished = false;
  }
  get events(): BeatEventDraft[] {
    return structuredClone(this.#events);
  }

  collectEngineEvents(): void {
    // Later contested checks can revise witnesses without moving earlier events.
    for (const [index, event] of this.engine.collectEvents().entries()) {
      const slot = this.#engineSlots[index] ?? this.#events.length;
      this.#engineSlots[index] = slot;
      this.#events[slot] = { ...event, createdBy: event.createdBy ?? 'engine' };
    }
  }

  appendEvents(events: readonly LogDraft[]): void {
    this.#events.push(
      ...structuredClone(events).map((event) => ({
        ...event,
        createdBy: event.createdBy ?? 'engine',
      })),
    );
  }

  async softState(): Promise<OntologyStore> {
    // Pending changes must be readable without projecting into the committed store.
    const view = new MemoryStore();
    await this.store.read(async (reader) => {
      const [nodes, edges] = await Promise.all([
        reader.nodes(),
        reader.edges(),
      ]);
      await view.apply([
        ...nodes.map((node) => ({ type: 'upsertNode' as const, node })),
        ...edges.map((edge) => ({ type: 'upsertEdge' as const, edge })),
      ]);
    });
    const records = envelopeDrafts(this.#events, {
      sessionId: 'pending',
      beat: this.beat,
      createdBy: 'engine',
      traceId: 'pending',
    });
    await view.apply(records.flatMap(project));
    return view;
  }
}
