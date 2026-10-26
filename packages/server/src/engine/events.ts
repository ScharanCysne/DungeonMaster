import type { CharacterId, GameEventOf, LocationId } from '@dungeon/shared';
import type { EngineState } from './state.js';
import { witnessesFor } from './rules/perception.js';

export type EngineEventType =
  | 'EntityMoved'
  | 'ItemTransferred'
  | 'ItemEquipped'
  | 'ItemUnequipped'
  | 'ContainerOpened'
  | 'ContainerUnlocked'
  | 'EntityRevealed'
  | 'EntityHidden'
  | 'CheckRolled'
  | 'DamageApplied'
  | 'Healed';
export type EventBody = {
  [K in EngineEventType]: Pick<GameEventOf<K>, 'type' | 'payload'>;
}[EngineEventType];
export type EventDraft = EventBody &
  Pick<GameEventOf<EngineEventType>, 'actor' | 'private' | 'witnesses'>;
export interface EventContext {
  actor: CharacterId | null;
  locationId: LocationId;
  targets: CharacterId[];
  private: boolean;
}
export interface PendingEvent {
  body: EventBody;
  context: EventContext;
  candidateWitnesses: CharacterId[];
}

export function eventDraft(
  state: EngineState,
  pending: PendingEvent,
): EventDraft {
  return {
    ...pending.body,
    actor: pending.context.actor,
    private: pending.context.private,
    witnesses: witnessesFor(state, pending),
  };
}

export interface CommandContext {
  state: EngineState;
  emit(
    body: EventBody,
    actor: CharacterId | null,
    locationId: LocationId,
    targets?: CharacterId[],
  ): void;
}
export interface CommandValue<T> {
  value: T;
  facts: string[];
}
