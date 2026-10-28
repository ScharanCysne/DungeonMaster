import type { Bootstrap } from './bootstrap.js';
import { knowledgeSlice } from '../ontology/queries/knowledge.js';
import { selectable } from './selection.js';

export async function sessionView(data: Bootstrap) {
  const knowledge = await knowledgeSlice(data.store, data.player);
  const character = data.engine.state.characters.get(data.player);
  const location = character
    ? data.engine.state.locations.get(character.locationId)
    : undefined;
  const last = data.records.findLast(
    (record) => record.type === 'NarrationCommitted',
  );
  return {
    location: location
      ? { name: location.name, summary: location.summary }
      : undefined,
    situation: last?.payload.text,
    visible: knowledge.visible,
    inventory: knowledge.inventory,
    gold: knowledge.character.gold,
    selectable: selectable(knowledge),
  };
}
