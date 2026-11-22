import { characterSchema } from '@dungeon/shared';
import type {
  CharacterId,
  EventNode,
  KnowledgeSlice,
  Node,
} from '@dungeon/shared';
import type { OntologyReader, OntologyStore } from '../OntologyStore.js';
import { debugNode } from '../projectionHelpers.js';
import { physical, spatialView } from './spatial.js';

export interface RecentOptions {
  sinceBeat?: number;
  recent?: number;
}
export function recentEvents(
  events: EventNode[],
  options: RecentOptions,
): EventNode[] {
  const since = options.sinceBeat ?? 0;
  const limit = options.recent ?? 20;
  if (
    !Number.isSafeInteger(since) ||
    since < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 0
  )
    throw new Error('Recent event bounds must be nonnegative integers.');
  return events
    .filter((event) => event.beat >= since)
    .sort((a, b) => b.beat - a.beat || b.seq - a.seq)
    .slice(0, limit);
}
async function knownFacts(
  reader: OntologyReader,
  character: CharacterId,
): Promise<KnowledgeSlice['facts']> {
  const edges = await reader.edges({ from: character, types: ['KNOWS'] });
  const facts: KnowledgeSlice['facts'] = [];
  for (const knowledge of edges) {
    const fact = await reader.getNode(knowledge.to);
    if (fact && 'statement' in fact && knowledge.type === 'KNOWS')
      facts.push({ fact, knowledge });
  }
  return facts;
}
async function witnessedEvents(
  reader: OntologyReader,
  character: CharacterId,
  options: RecentOptions,
): Promise<EventNode[]> {
  const edges = await reader.edges({ from: character, types: ['WITNESSED'] });
  const events: EventNode[] = [];
  for (const edge of edges) {
    const event = await reader.getNode(edge.to);
    if (event && 'seq' in event) events.push(event);
  }
  return recentEvents(events, options);
}
async function visibleEntities(
  reader: OntologyReader,
  character: CharacterId,
): Promise<Node[]> {
  const spatial = await spatialView(reader);
  const room = spatial.room(character);
  if (!room) return [];
  return spatial.nodes
    .filter(
      (node) =>
        physical(node) &&
        spatial.directlyLocated.has(node.id) &&
        spatial.room(node.id)?.id === room.id &&
        (!('hidden' in node) || !node.hidden),
    )
    .map(debugNode);
}

export function knowledgeSlice(
  store: OntologyStore,
  characterId: CharacterId,
  options: RecentOptions = {},
): Promise<KnowledgeSlice> {
  return store.read(async (reader) => {
    const sheet = await reader.getNode(characterId);
    if (!sheet || !('role' in sheet))
      throw new Error(`Missing character ${characterId}.`);
    // These have different result shapes and remain separate reads in one snapshot.
    const [facts, events, visible, ownEdges] = await Promise.all([
      knownFacts(reader, characterId),
      witnessedEvents(reader, characterId, options),
      visibleEntities(reader, characterId),
      reader.edges({
        from: characterId,
        types: ['ATTITUDE', 'PURSUES', 'HAS_SECRET', 'CARRIES'],
      }),
    ]);
    const quests: KnowledgeSlice['quests'] = [];
    const inventory: KnowledgeSlice['inventory'] = [];
    for (const edge of ownEdges) {
      if (edge.type !== 'PURSUES' && edge.type !== 'CARRIES') continue;
      const node = await reader.getNode(edge.to);
      if (node && 'objective' in node && edge.type === 'PURSUES')
        quests.push(node);
      if (node && 'questCritical' in node && edge.type === 'CARRIES')
        inventory.push(node);
    }
    const secretIds = new Set(
      ownEdges
        .filter((edge) => edge.type === 'HAS_SECRET')
        .map((edge) => edge.to),
    );
    return {
      character: characterSchema.parse(debugNode(sheet)),
      facts,
      events,
      visible,
      quests,
      inventory,
      attitudes: ownEdges.filter((edge) => edge.type === 'ATTITUDE'),
      secrets: facts
        .filter(({ fact }) => secretIds.has(fact.id))
        .map(({ fact }) => fact),
    };
  });
}
