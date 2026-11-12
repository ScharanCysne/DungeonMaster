import type {
  CharacterId,
  DebugKind,
  EntityId,
  PlayerIntent,
} from '@dungeon/shared';
import type { ClientState } from './types';

export type ClientAction =
  | { type: 'selection_toggle'; id: EntityId }
  | { type: 'selection_clear' }
  | { type: 'journal_revealed'; beat: number }
  | { type: 'journal_scroll'; scroll: ClientState['journal']['scroll'] }
  | { type: 'trace_focus'; traceId: string }
  | { type: 'composer_text'; text: string }
  | { type: 'composer_recall' }
  | { type: 'intent_sent'; intent: PlayerIntent }
  | { type: 'dev_toggle'; key: 'dmView' | 'inspector' }
  | { type: 'appendix'; tab: DebugKind | null }
  | { type: 'agent'; id: CharacterId | null }
  | {
      type: 'connection';
      status: ClientState['connection']['status'];
      retries: number;
    }
  | { type: 'received_at'; at: number };

export function applyClientAction(
  state: ClientState,
  action: ClientAction,
): ClientState {
  switch (action.type) {
    case 'selection_toggle': {
      const { ids } = state.selection;
      if (ids.includes(action.id))
        return {
          ...state,
          selection: {
            ids: ids.filter((id) => id !== action.id),
            tooMany: false,
          },
        };
      if (!state.world.entities[action.id]) return state;
      if (ids.length === 6)
        return { ...state, selection: { ids, tooMany: true } };
      return {
        ...state,
        selection: { ids: [...ids, action.id], tooMany: false },
      };
    }
    case 'journal_scroll':
      return { ...state, journal: { ...state.journal, scroll: action.scroll } };
    case 'trace_focus':
      return {
        ...state,
        dev: { ...state.dev, appendixTab: 'trace', traceFocus: action.traceId },
      };
    case 'journal_revealed':
      return state.journal.reveal?.beat === action.beat
        ? {
            ...state,
            journal: {
              ...state.journal,
              reveal: { beat: action.beat, status: 'complete' },
            },
          }
        : state;
    case 'selection_clear':
      return { ...state, selection: { ids: [], tooMany: false } };
    case 'composer_text':
      return {
        ...state,
        composer: { ...state.composer, text: action.text.slice(0, 500) },
      };
    case 'composer_recall':
      return {
        ...state,
        composer: {
          ...state.composer,
          text: state.composer.history.at(-1)?.text ?? state.composer.text,
        },
      };
    case 'intent_sent':
      return {
        ...state,
        selection: { ids: [], tooMany: false },
        composer: {
          text: '',
          history: [...state.composer.history, action.intent],
          pending: action.intent,
        },
        connection: { ...state.connection, error: null },
      };
    case 'dev_toggle':
      if (!state.dev.devTools) return state;
      return {
        ...state,
        dev: { ...state.dev, [action.key]: !state.dev[action.key] },
      };
    case 'appendix':
      return {
        ...state,
        dev: {
          ...state.dev,
          appendixTab: state.dev.appendixTab === action.tab ? null : action.tab,
        },
      };
    case 'agent':
      return { ...state, dev: { ...state.dev, chosenAgent: action.id } };
    case 'connection':
      return {
        ...state,
        composer:
          action.status === 'closed' &&
          state.beat.status === 'idle' &&
          state.composer.pending
            ? {
                ...state.composer,
                text: state.composer.text || state.composer.pending.text,
                pending: null,
              }
            : state.composer,
        connection: {
          ...state.connection,
          status: action.status,
          retries: action.retries,
          error:
            action.status === 'open' &&
            state.connection.error?.code.startsWith('CONNECTION_')
              ? null
              : state.connection.error,
        },
      };
    case 'received_at':
      return {
        ...state,
        connection: { ...state.connection, receivedAt: action.at },
      };
  }
}
