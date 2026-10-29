import {
  beatResultSchema,
  gameEventSchema,
  worldSnapshotSchema,
} from '@dungeon/shared';
import type { EventEnvelope, GameEvent } from '@dungeon/shared';
import {
  character,
  container,
  envelope,
  item,
  location,
} from '../../../shared/src/testing/fixtures';
import { eventPayloads } from '../../../shared/src/testing/event-fixtures';

export const snapshot = worldSnapshotSchema.parse({
  type: 'world_snapshot',
  beat: 0,
  mapId: 'tavern',
  entities: [
    { ...character, name: 'Kael' },
    { ...character, id: 'char:ilsa', name: 'Ilsa', role: 'peer', hp: 8 },
    { ...character, id: 'char:brann', name: 'Brann', role: 'npc' },
    { ...location, name: 'The Crooked Lantern', kind: 'building' },
    { ...item, name: 'Quill', hidden: false },
    { ...item, id: 'item:rope', name: 'Rope', hidden: false },
    { ...container, name: 'Old box', hidden: false },
  ],
  positions: [
    { entityId: 'char:player', locationId: 'loc:room', tile: { x: 1, y: 1 } },
  ],
  party: ['char:player', 'char:ilsa'],
  inventory: ['item:rope'],
  gold: 20,
  recentNarration: [],
});
export function event(
  type: GameEvent['type'],
  payload: unknown = eventPayloads[type],
  overrides: Partial<EventEnvelope> = {},
): GameEvent {
  return gameEventSchema.parse({ ...envelope, ...overrides, type, payload });
}
export function result(events: GameEvent[] = [], beat = 1) {
  return beatResultSchema.parse({
    type: 'beat_result',
    beat,
    events,
    narration: {
      text: 'The board gives with a dry creak.',
      lines: [{ speaker: 'char:ilsa', text: 'A clue.' }],
    },
    rolls: [],
    traceId: `beat-${beat}`,
  });
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
