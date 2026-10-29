import type { ClientMessage, EntityId } from '@dungeon/shared';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { ClientStore } from '../store';
import { AppendixTabs } from './Appendix';
import { beatStatus } from './Composer';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';

export interface BookLayoutProps {
  store: StoreApi<ClientStore>;
  send: (message: ClientMessage) => boolean;
}
export function BookLayout({ store, send }: BookLayoutProps) {
  const state = useStore(store);
  const { dispatch } = state;
  const onToggle = (id: EntityId) => dispatch({ type: 'selection_toggle', id });
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch({ type: 'selection_clear' });
        dispatch({ type: 'appendix', tab: null });
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [dispatch]);
  const disabled =
    state.beat.status !== 'idle' ||
    state.connection.status !== 'open' ||
    state.world.mapId === null ||
    state.composer.pending !== null;
  const status =
    beatStatus(state.beat) ||
    (state.connection.status === 'closed'
      ? 'Connection lost. Reconnecting…'
      : state.connection.status === 'connecting'
        ? 'Opening the book…'
        : state.composer.pending
          ? "The Dungeon Master's quill scratches…"
          : '');
  return (
    <main className="desk">
      <header className="desk-heading">
        <h1>Episode N</h1>
        <span>The Inkless Quill</span>
      </header>
      <div className="book-spread">
        <div className="book">
          <LeftPage
            world={state.world}
            beat={state.beat.number}
            connection={state.connection}
            selection={state.selection.ids}
            onToggle={onToggle}
          />
          <RightPage
            journal={{
              entries: state.journal.entries,
              entities: state.world.entities,
              onToggle,
            }}
            composer={{
              world: state.world,
              selection: state.selection,
              text: state.composer.text,
              disabled,
              status,
              onToggle,
              onText: (text) => dispatch({ type: 'composer_text', text }),
              onRecall: () => dispatch({ type: 'composer_recall' }),
              onSubmit: () => {
                if (!disabled)
                  send({
                    type: 'player_intent',
                    selection: state.selection.ids,
                    text: state.composer.text,
                  });
              },
            }}
            appendix={state.dev.devTools ? state.dev.appendixTab : null}
            onCloseAppendix={() => dispatch({ type: 'appendix', tab: null })}
            error={
              state.connection.error
                ? `${state.connection.error.code}: ${state.connection.error.message}`
                : null
            }
          />
        </div>
        {state.dev.devTools && (
          <AppendixTabs
            active={state.dev.appendixTab}
            onToggle={(tab) => dispatch({ type: 'appendix', tab })}
          />
        )}
      </div>
    </main>
  );
}
