import type {
  CharacterId,
  KnowledgeSlice,
  PlayerIntent,
} from '@dungeon/shared';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { knowledgeSlice } from '../ontology/queries/knowledge.js';
import { SessionError } from './errors.js';

export function selectable(knowledge: KnowledgeSlice) {
  return [
    knowledge.character,
    ...knowledge.visible,
    ...knowledge.inventory,
  ].filter(
    (node, index, nodes) =>
      nodes.findIndex(({ id }) => id === node.id) === index,
  );
}

export async function validateSelection(
  store: OntologyStore,
  player: CharacterId,
  intent: PlayerIntent,
): Promise<KnowledgeSlice> {
  const knowledge = await knowledgeSlice(store, player);
  const ids = new Set(selectable(knowledge).map(({ id }) => id));
  for (const id of intent.selection)
    if (!ids.has(id))
      throw new SessionError(
        'INVALID_SELECTION',
        `${id}: expected an existing entity visible to the player or in their inventory.`,
      );
  return knowledge;
}
