import type { EntityId, Tile } from '@dungeon/shared';
import { createClientStore } from '../store';
import { event, snapshot } from '../testing/fixtures';

export function mapStore() {
  const store = createClientStore();
  store.getState().receive(
    {
      ...snapshot,
      positions: [
        'char:player',
        'char:ilsa',
        'char:brann',
        'container:box',
        'item:quill',
        'item:rope',
      ].map((id, x) => {
        const entity = snapshot.entities.find((entity) => entity.id === id);
        if (!entity) throw new Error('Missing map fixture entity');
        return {
          entityId: entity.id,
          locationId: 'loc:room',
          tile: { x: x + 1, y: 2 },
        };
      }),
    },
    0,
  );
  return store;
}
export function moved(id: EntityId, path: Tile[], seq = 1) {
  return event(
    'EntityMoved',
    {
      entityId: id,
      from: 'loc:room',
      to: 'loc:room',
      path,
      tile: path.at(-1),
    },
    { seq },
  );
}
