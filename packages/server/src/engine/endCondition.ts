import type { CharacterId } from '@dungeon/shared';
import type { EngineState } from './state.js';

export function endCondition(state: EngineState): CharacterId | null {
  for (const item of state.items.values()) {
    if (!item.questCritical || item.holder.kind !== 'character') continue;
    const holder = state.characters.get(item.holder.id);
    if (holder?.role === 'player' || holder?.role === 'peer') return holder.id;
  }
  return null;
}
