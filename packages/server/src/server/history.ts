import type {
  BeatResult,
  CharacterId,
  GameEvent,
  EntityId,
  Graph,
  WorldSnapshot,
} from '@dungeon/shared';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { project } from '../ontology/projector.js';
import { debugNode } from '../ontology/projectionHelpers.js';
import { knowledgeSlice } from '../ontology/queries/knowledge.js';
import { playerPerspective } from './perspective.js';
import { tilesIn } from '../engine/spatial.js';
import type { WalkabilityGrid } from '../engine/state.js';

export class PlayerHistory {
  readonly store = new MemoryStore();
  readonly results: BeatResult[] = [];
  #offset = 0;
  #beat = 0;
  #seen = new Set<EntityId>();
  constructor(
    readonly player: CharacterId,
    readonly mapId: string,
    readonly dev: boolean,
    readonly grid: WalkabilityGrid,
  ) {}

  async perspective() {
    const graph: Graph = {
      nodes: (await this.store.nodes()).map(debugNode),
      edges: await this.store.edges(),
    };
    const knowledge = await knowledgeSlice(this.store, this.player);
    for (const node of [
      knowledge.character,
      ...knowledge.visible,
      ...knowledge.inventory,
    ])
      this.#seen.add(node.id);
    return playerPerspective(knowledge, graph, [...this.#seen]);
  }

  async sync(records: readonly GameEvent[]) {
    let batch: GameEvent[] = [];
    for (const record of records.slice(this.#offset)) {
      batch.push(record);
      if (record.type !== 'BeatCommitted') continue;
      // The canonical log also works while the external graph is catching up.
      await this.store.apply(batch.flatMap(project));
      this.#beat = record.beat;
      const perspective = await this.perspective();
      const narration = batch.find(
        (event) => event.type === 'NarrationCommitted',
      );
      if (narration) {
        this.results.push(
          perspective.result(
            {
              type: 'beat_result',
              beat: record.beat,
              events: batch,
              narration: narration.payload,
              rolls: [],
              traceId: record.traceId,
            },
            this.dev,
          ),
        );
      }
      this.#offset += batch.length;
      batch = [];
    }
  }

  async snapshot(): Promise<WorldSnapshot> {
    const nodes = await this.store.nodes();
    const edges = await this.store.edges({ types: ['LOCATED_IN'] });
    const positions: WorldSnapshot['positions'] = edges.flatMap((edge) => {
      if (edge.type !== 'LOCATED_IN') return [];
      const node = nodes.find(({ id }) => id === edge.from);
      const location = nodes.find(({ id }) => id === edge.to);
      const tile =
        node?.tile ??
        (location && 'tileBounds' in location
          ? tilesIn(location.tileBounds).find(
              ({ x, y }) => this.grid.walkable[y]?.[x],
            )
          : undefined);
      if (!tile) return [];
      return [{ entityId: edge.from, locationId: edge.to, tile }];
    });
    return (await this.perspective()).snapshot({
      beat: this.#beat,
      mapId: this.mapId,
      positions,
      recentNarration: this.results
        .slice(-20)
        .map(({ narration }) => narration),
    });
  }
}
