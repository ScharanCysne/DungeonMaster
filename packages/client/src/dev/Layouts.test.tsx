import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ClientMessage } from '@dungeon/shared';
import { App } from '../App';
import { createClientStore } from '../store';
import { debugGraph, debugTrace } from '../testing/dev';
import { result, snapshot } from '../testing/fixtures';
import { createMapGame } from '../map/game';

vi.mock('./cytoscapeAdapter', () => ({ mountGraph: () => ({ destroy() {} }) }));
const mapDestroy = vi.hoisted(() => vi.fn());
vi.mock('../map/game', () => ({
  createMapGame: vi.fn(() => ({ destroy: mapDestroy })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup(dev = false) {
  const store = createClientStore();
  store.getState().receive(snapshot, 0);
  store.getState().dispatch({ type: 'connection', status: 'open', retries: 0 });
  if (dev)
    store
      .getState()
      .receive({ type: 'debug_response', kind: 'graph', data: debugGraph }, 0);
  const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
  render(<App store={store} send={send} />);
  return { store, send };
}
test('bookmarks probe a server before dev mode is known and show DEBUG_DISABLED calmly', () => {
  const { store, send } = setup();
  expect(screen.queryByRole('button', { name: 'DM view' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
  expect(send).toHaveBeenCalledWith({
    type: 'debug_request',
    kind: 'graph',
    target: 'char:player',
  });
  act(() =>
    store
      .getState()
      .receive(
        { type: 'error', code: 'DEBUG_DISABLED', message: 'No debug' },
        1,
      ),
  );
  expect(
    screen.getByText(
      'Developer views are disabled on this server (DUNGEON_DEV)',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
  expect(
    screen.queryByRole('heading', { name: 'Appendix · graph' }),
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Trace' }));
  expect(send).toHaveBeenCalledWith({
    type: 'debug_request',
    kind: 'trace',
    target: '0',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }));
  expect(send).toHaveBeenCalledWith({
    type: 'debug_request',
    kind: 'knowledge',
    target: 'char:player',
  });
});
test('drawer fetches on opening, selection changes and each committed result', () => {
  const { store, send } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Ilsa.*HP/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
  expect(send).toHaveBeenLastCalledWith({
    type: 'debug_request',
    kind: 'graph',
    target: 'char:ilsa',
  });
  act(() => store.getState().receive(result(), 1));
  expect(
    send.mock.calls.filter(
      ([message]) =>
        message.type === 'debug_request' && message.kind === 'graph',
    ),
  ).toHaveLength(2);
  act(() =>
    store
      .getState()
      .receive({ type: 'debug_response', kind: 'graph', data: debugGraph }, 2),
  );
  expect(store.getState().dev.graph).toEqual(debugGraph);
  fireEvent.click(screen.getByRole('button', { name: 'close ×' }));
  act(() => store.getState().receive(result([], 2), 3));
  expect(
    send.mock.calls.filter(
      ([message]) =>
        message.type === 'debug_request' && message.kind === 'graph',
    ),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }));
  act(() => store.getState().receive(result([], 3), 4));
  expect(
    send.mock.calls.filter(
      ([message]) =>
        message.type === 'debug_request' && message.kind === 'knowledge',
    ),
  ).toHaveLength(2);
});
test('Escape focused in the drawer closes it, preserves selection, and restores focus', () => {
  const { store } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Ilsa.*HP/ }));
  const bookmark = screen.getByRole('button', { name: 'Graph' });
  bookmark.focus();
  fireEvent.click(bookmark);
  const drawer = screen.getByRole('region', { name: 'Appendix · graph' });
  expect(document.activeElement).toBe(drawer);
  fireEvent.keyDown(drawer, { key: 'Escape' });
  expect(store.getState().selection.ids).toEqual(['char:ilsa']);
  expect(store.getState().dev.appendixTab).toBeNull();
  expect(document.activeElement).toBe(bookmark);
});
test('backtick requires dev mode and ignores composer typing and key repeats', () => {
  const { store } = setup();
  fireEvent.keyDown(window, { key: '`' });
  expect(store.getState().dev.inspector).toBe(false);
  act(() =>
    store
      .getState()
      .receive({ type: 'debug_response', kind: 'graph', data: debugGraph }, 1),
  );
  fireEvent.keyDown(screen.getByRole('textbox'), { key: '`' });
  expect(store.getState().dev.inspector).toBe(false);
  fireEvent.keyDown(window, { key: '`', repeat: true });
  expect(store.getState().dev.inspector).toBe(false);
  fireEvent.keyDown(window, { key: '`' });
  expect(store.getState().dev.inspector).toBe(true);
  expect(
    screen.getByRole('complementary', { name: 'Party and knowledge' }),
  ).toBeTruthy();
});
test('Inspector switches preserve selection, draft and scroll, recreate the map and show raw IDs', () => {
  const { store, send } = setup(true);
  fireEvent.click(screen.getByRole('button', { name: /Ilsa.*HP/ }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Keep this thought.' },
  });
  const journal = screen.getByRole('region', { name: 'Journal' });
  Object.defineProperties(journal, {
    scrollHeight: { value: 2000 },
    clientHeight: { value: 400 },
  });
  journal.scrollTop = 123;
  fireEvent.scroll(journal);
  expect(store.getState().journal.scroll).toEqual({
    top: 123,
    following: false,
  });
  fireEvent.keyDown(window, { key: '`' });
  expect(mapDestroy).toHaveBeenCalledOnce();
  expect(vi.mocked(createMapGame)).toHaveBeenCalledTimes(2);
  expect(store.getState().selection.ids).toEqual(['char:ilsa']);
  expect(screen.getByDisplayValue('Keep this thought.')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Journal' }).scrollTop).toBe(123);
  expect(
    screen.getByRole('button', { name: 'Remove Ilsa from selection' })
      .textContent,
  ).toContain('char:ilsa');
  for (const kind of ['graph', 'trace', 'knowledge'])
    expect(
      send.mock.calls.some(
        ([message]) =>
          message.type === 'debug_request' && message.kind === kind,
      ),
    ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Inspector `' }));
  expect(screen.getByRole('region', { name: 'Journal' }).scrollTop).toBe(123);
  expect(screen.getByDisplayValue('Keep this thought.')).toBeTruthy();
  expect(store.getState().selection.ids).toEqual(['char:ilsa']);
});
test('fallback note opens and focuses its trace card only with developer tools', () => {
  const { store } = setup(true);
  act(() => {
    store.getState().receive(result(), 1);
    store
      .getState()
      .receive({ type: 'debug_response', kind: 'trace', data: debugTrace }, 2);
  });
  fireEvent.keyDown(window, { key: ' ' });
  fireEvent.click(screen.getByRole('button', { name: 'critic fallback' }));
  expect(document.activeElement?.id).toBe('trace-beat-1');
  fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' });
  act(() =>
    store
      .getState()
      .receive(
        { type: 'error', code: 'DEBUG_DISABLED', message: 'Disabled' },
        3,
      ),
  );
  expect(screen.queryByRole('button', { name: 'critic fallback' })).toBeNull();
});
