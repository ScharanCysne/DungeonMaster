import type { CharacterId, ToolResult } from '@dungeon/shared';
import { EngineError } from './errors.js';
import { eventDraft } from './events.js';
import type {
  CommandContext,
  CommandValue,
  EventDraft,
  PendingEvent,
} from './events.js';
import { protectQuestItems } from './questItems.js';
import { finishTurn, requireTurn } from './rules/combat.js';
import { witnessCandidates } from './rules/perception.js';
import type { EngineState } from './state.js';

export interface CommandOptions {
  private?: boolean;
}
export type CommandActor =
  CharacterId | ((state: EngineState) => CharacterId | undefined);

export function runCommand<T>(
  previous: EngineState,
  command: string,
  handler: (ctx: CommandContext) => CommandValue<T>,
  options: CommandOptions,
  actor?: CommandActor,
):
  | {
      ok: true;
      state: EngineState;
      pending: PendingEvent[];
      result: ToolResult<T, EventDraft>;
    }
  | Extract<ToolResult<T, EventDraft>, { ok: false }> {
  const state = structuredClone(previous);
  const emitted: Omit<PendingEvent, 'candidateWitnesses'>[] = [];
  try {
    const ctx: CommandContext = {
      state,
      emit: (body, eventActor, locationId, targets = []) => {
        emitted.push({
          body,
          context: {
            actor: eventActor,
            locationId,
            targets,
            private: options.private ?? false,
          },
        });
      },
    };
    const acting = typeof actor === 'function' ? actor(state) : actor;
    if (acting !== undefined) requireTurn(state, acting, command === 'move');
    const result = handler(ctx);
    finishTurn(ctx, acting, command === 'move');
    protectQuestItems(previous, state, command);
    const pending = emitted.map((event) => ({
      ...event,
      candidateWitnesses: witnessCandidates(state, event.context),
    }));
    const events = pending.map((event) => eventDraft(state, event));
    return {
      ok: true,
      state,
      pending: structuredClone(pending),
      result: structuredClone({ ok: true, ...result, events }),
    };
  } catch (error) {
    if (error instanceof EngineError)
      return { ok: false, error: { code: error.code, message: error.message } };
    throw error;
  }
}
