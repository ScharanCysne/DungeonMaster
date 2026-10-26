import { characterSchema } from '@dungeon/shared';
import type {
  Character,
  CharacterId,
  EntityId,
  EventNode,
  Location,
  Graph,
  Quest,
} from '@dungeon/shared';
import type { OntologyStore } from '../OntologyStore.js';
import { debugNode } from '../projectionHelpers.js';
import { recentEvents } from './knowledge.js';
import { readSelection } from './selection.js';
import type { SelectionContext } from './selection.js';
import { physical, spatialView } from './spatial.js';

export interface DMContext {
  player: Character;
  room: Location;
  groundTruth: Graph;
  quests: Quest[];
  events: EventNode[];
  selection: SelectionContext;
}
export function dmContext(
  store: OntologyStore,
  playerId: CharacterId,
  selection: readonly EntityId[] = [],
  recent = 20,
): Promise<DMContext> {
  return store.read(async (reader) => {
    const spatial = await spatialView(reader);
    const sheet = await reader.getNode(playerId);
    const room = spatial.room(playerId);
    if (!sheet || !('role' in sheet) || !room)
      throw new Error(`Missing player or room for ${playerId}.`);
    const building = spatial.building(room.id);
    const entities = spatial.nodes
      .filter((node) => {
        if (!physical(node)) return false;
        const entityRoom = spatial.room(node.id);
        return (
          entityRoom?.id === room.id ||
          (building !== undefined &&
            entityRoom !== undefined &&
            spatial.building(entityRoom.id)?.id === building.id)
        );
      })
      .map(debugNode);
    const locations = spatial.nodes.filter(
      (node) =>
        'tileBounds' in node &&
        (node.id === room.id ||
          spatial.room(node.id)?.id === room.id ||
          (building !== undefined &&
            spatial.building(node.id)?.id === building.id)),
    );
    const groundNodes = [...entities, ...locations];
    const included = new Set(groundNodes.map((node) => node.id));
    const edges = (await reader.edges()).filter(
      (edge) => included.has(edge.from) && included.has(edge.to),
    );
    return {
      player: characterSchema.parse(debugNode(sheet)),
      room,
      groundTruth: { nodes: groundNodes, edges },
      quests: spatial.nodes.filter(
        (node): node is Quest => 'objective' in node,
      ),
      events: recentEvents(
        spatial.nodes.filter((node): node is EventNode => 'seq' in node),
        { recent },
      ),
      selection: await readSelection(reader, selection),
    };
  });
}
