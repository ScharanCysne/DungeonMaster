import type { ClientMessage, DebugKind, EntityId } from '@dungeon/shared';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { ClientStore } from '../store';
import { MapView } from '../map/MapView';
import { DeveloperView } from '../dev/DeveloperViews';
import { useDeveloperViews } from '../dev/useDeveloperViews';
import { AppendixDrawer, AppendixTabs } from './Appendix';
import { InspectorLayout } from './InspectorLayout';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import type { ComponentProps } from 'react';

export interface BookLayoutProps {
  store: StoreApi<ClientStore>;
  send: (message: ClientMessage) => boolean;
}
export function BookLayout({ store, send }: BookLayoutProps) {
  const state = useStore(store);
  const { dispatch, dev } = state;
  const { chosen } = useDeveloperViews(state, send);
  const onToggle = (id: EntityId) => dispatch({ type: 'selection_toggle', id });
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (store.getState().dev.appendixTab)
          dispatch({ type: 'appendix', tab: null });
        else dispatch({ type: 'selection_clear' });
      }
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (
        event.key === '`' &&
        !typing &&
        !event.repeat &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (store.getState().dev.devTools) {
          event.preventDefault();
          dispatch({ type: 'dev_toggle', key: 'inspector' });
        }
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [dispatch, store]);
  const disabled =
    state.beat.status !== 'idle' ||
    state.connection.status !== 'open' ||
    state.world.mapId === null ||
    state.composer.pending !== null;
  const status =
    state.connection.status === 'closed'
      ? 'Connection lost. Reconnecting…'
      : state.connection.status === 'connecting'
        ? 'Opening the book…'
        : state.composer.pending
          ? "The Dungeon Master's quill scratches…"
          : '';
  const view = (kind: DebugKind) => (
    <DeveloperView
      kind={kind}
      state={state}
      chosen={chosen}
      onAgent={(id) => dispatch({ type: 'agent', id })}
      onToggle={onToggle}
    />
  );
  const story: ComponentProps<typeof RightPage> = {
    journal: {
      entries: state.journal.entries,
      reveal: state.journal.reveal,
      beat: state.beat,
      devTools: dev.devTools,
      traces: dev.traces,
      entities: state.world.entities,
      onToggle,
      scrollPosition: state.journal.scroll,
      rawIds: dev.inspector,
      onScrollPosition: (scroll) =>
        dispatch({ type: 'journal_scroll', scroll }),
      onRevealComplete: (beat) => dispatch({ type: 'journal_revealed', beat }),
      onTrace: (traceId) => dispatch({ type: 'trace_focus', traceId }),
    },
    composer: {
      world: state.world,
      selection: state.selection,
      text: state.composer.text,
      disabled,
      status,
      beat: state.beat,
      rawIds: dev.inspector,
      onClear: () => dispatch({ type: 'selection_clear' }),
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
    },
    error: state.connection.error
      ? `${state.connection.error.code}: ${state.connection.error.message}`
      : null,
    appendix:
      !dev.inspector && dev.appendixTab ? (
        <AppendixDrawer
          tab={dev.appendixTab}
          onClose={() => dispatch({ type: 'appendix', tab: null })}
        >
          {view(dev.appendixTab)}
        </AppendixDrawer>
      ) : null,
  };
  return (
    <main className="desk">
      <header className="desk-heading">
        <h1>Episode N</h1>
        <span>The Inkless Quill</span>
        {dev.devTools && (
          <div className="developer-toggles">
            <button
              aria-pressed={dev.dmView}
              onClick={() => dispatch({ type: 'dev_toggle', key: 'dmView' })}
            >
              DM view
            </button>
            <button
              aria-pressed={dev.inspector}
              onClick={() => dispatch({ type: 'dev_toggle', key: 'inspector' })}
            >
              Inspector `
            </button>
          </div>
        )}
      </header>
      {dev.inspector ? (
        <InspectorLayout
          possessions={{
            world: state.world,
            selection: state.selection.ids,
            onToggle,
          }}
          story={story}
          map={<MapView store={store} />}
          knowledge={view('knowledge')}
          graph={view('graph')}
          trace={view('trace')}
        />
      ) : (
        <div className="book-spread">
          <div className="book">
            <LeftPage
              map={<MapView store={store} />}
              world={state.world}
              beat={state.beat.number}
              connection={state.connection}
              selection={state.selection.ids}
              onToggle={onToggle}
            />
            <RightPage {...story} />
          </div>
          <AppendixTabs
            active={dev.appendixTab}
            onToggle={(tab) => dispatch({ type: 'appendix', tab })}
          />
        </div>
      )}
    </main>
  );
}
