import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ClientMessage } from '@dungeon/shared';
import { App } from '../App';
import { createClientStore } from '../store';
import { result, snapshot } from '../testing/fixtures';
import { mockReducedMotion } from '../testing/ui';

vi.mock('../map/game', () => ({ createMapGame: () => ({ destroy() {} }) }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  mockReducedMotion();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const store = createClientStore();
  store.getState().receive(snapshot, 0);
  store.getState().dispatch({ type: 'connection', status: 'open', retries: 0 });
  const send = vi.fn((message: ClientMessage) => {
    if (message.type === 'player_intent')
      store.getState().dispatch({ type: 'intent_sent', intent: message });
    return true;
  });
  render(<App store={store} send={send} />);
  const input = screen.getByRole('textbox');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing input');
  return { store, send, input };
}
it.each(['Enter', 'Write'])(
  '%s submits the selection and text, clears chips and saves history',
  (method) => {
    const { store, send, input } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Ilsa.*HP/ }));
    fireEvent.change(input, { target: { value: 'Ask about the cellar.' } });
    if (method === 'Enter') fireEvent.keyDown(input, { key: 'Enter' });
    else fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(send).toHaveBeenCalledWith({
      type: 'player_intent',
      selection: ['char:ilsa'],
      text: 'Ask about the cellar.',
    });
    expect(store.getState().selection.ids).toEqual([]);
    expect(store.getState().composer.history).toHaveLength(1);
    expect(input.value).toBe('');
  },
);
it('allows text without selection and ignores whitespace-only submission', () => {
  const { send, input } = setup();
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'Order a round.' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledWith({
    type: 'player_intent',
    text: 'Order a round.',
    selection: [],
  });
});
it('disables only submission during a running beat, keeps drafts and re-enables on commit', () => {
  const { store, send, input } = setup();
  act(() => store.getState().receive({ type: 'beat_started', beat: 1 }, 0));
  fireEvent.change(input, { target: { value: 'My next thought.' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Write' }));
  expect(send).not.toHaveBeenCalled();
  expect(input.disabled).toBe(false);
  expect(input.value).toBe('My next thought.');
  act(() => store.getState().receive(result(), 5));
  expect(
    screen.getByRole('button', { name: 'Write' }).hasAttribute('disabled'),
  ).toBe(false);
  fireEvent.keyDown(input, { key: 'n' });
  fireEvent.change(input, { target: { value: 'My next thought. Now.' } });
  expect(screen.getByText('The board gives with a dry creak.')).toBeTruthy();
  expect(input.value).toBe('My next thought. Now.');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledWith({
    type: 'player_intent',
    selection: [],
    text: 'My next thought. Now.',
  });
});
it('uses CLI status wording and ticks elapsed seconds under the composer', () => {
  const { store } = setup();
  act(() =>
    store.getState().receive(
      {
        type: 'beat_progress',
        beat: 1,
        progress: { kind: 'status', phase: 'dm', toolCalls: 3 },
      },
      0,
    ),
  );
  act(() => {
    vi.advanceTimersByTime(18_000);
  });
  expect(screen.getByText('DM is resolving… 3 actions · 18s')).toBeTruthy();
  act(() => store.getState().receive(result(), 18_000));
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.queryByText(/DM is resolving/)).toBeNull();
});
it('Escape clears selection and chips remove one selected entity', () => {
  const { store, input } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Ilsa.*HP/ }));
  fireEvent.click(screen.getByRole('button', { name: /Rope/ }));
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Remove Rope from selection' }),
    { key: 'Enter' },
  );
  expect(store.getState().selection.ids).toEqual(['char:ilsa']);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(store.getState().selection.ids).toEqual([]);
});
it('ArrowUp recalls the latest submitted intent only at the start or in an empty input', () => {
  const { input, store } = setup();
  act(() =>
    store.getState().dispatch({
      type: 'intent_sent',
      intent: { type: 'player_intent', selection: [], text: 'Remember me.' },
    }),
  );
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('Remember me.');
  fireEvent.change(input, { target: { value: 'Keep this draft.' } });
  input.setSelectionRange(4, 4);
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('Keep this draft.');
  input.setSelectionRange(0, 0);
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('Remember me.');
});
it('shows a gentle hint on a seventh selection and clears it after a removal', () => {
  const { store } = setup();
  act(() =>
    snapshot.entities.forEach((node) =>
      store.getState().dispatch({ type: 'selection_toggle', id: node.id }),
    ),
  );
  expect(store.getState().selection.ids).toHaveLength(6);
  expect(
    screen.getByText('Too many selections — choose up to 6.'),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Kael from selection' }),
  );
  expect(screen.queryByText(/Too many selections/)).toBeNull();
});
it.each([
  ['char:ilsa', 'ask, bribe, distract…'],
  ['container:box', 'search, open, force…'],
  ['item:rope', 'use, give, examine…'],
  ['loc:room', 'inspect, go to…'],
] as const)('suggests example verbs for %s', (id, placeholder) => {
  const { input, store } = setup();
  act(() => store.getState().dispatch({ type: 'selection_toggle', id }));
  expect(input.placeholder).toBe(placeholder);
});
it('limits input to 500 characters and shows a counter near the limit', () => {
  const { input, store } = setup();
  expect(screen.queryByText(/\/500/)).toBeNull();
  fireEvent.change(input, { target: { value: 'a'.repeat(450) } });
  expect(screen.getByText('450/500')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'a'.repeat(510) } });
  expect(input.maxLength).toBe(500);
  expect(input.value).toHaveLength(500);
  expect(store.getState().composer.text).toHaveLength(500);
  expect(screen.getByText('500/500')).toBeTruthy();
});
it('does not submit on an IME confirmation or repeat Enter', () => {
  const { input, send } = setup();
  fireEvent.change(input, { target: { value: 'Wait.' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(input, { key: 'Enter', repeat: true });
  expect(send).not.toHaveBeenCalled();
});
