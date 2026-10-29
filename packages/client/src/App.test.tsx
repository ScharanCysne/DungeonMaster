import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { createClientStore } from './store';
import { createInitialState } from './store/types';
import { event, result, snapshot } from './testing/fixtures';

vi.mock('./map/game', () => ({ createMapGame: () => ({ destroy() {} }) }));

function setup() {
  const store = createClientStore(createInitialState());
  store.getState().receive(snapshot, 0);
  store.getState().dispatch({ type: 'connection', status: 'open', retries: 0 });
  const send = vi.fn(() => true);
  render(<App store={store} send={send} />);
  return { store, send };
}
afterEach(cleanup);

test('renders Episode N and the Codex book structure', () => {
  render(<App store={createClientStore()} />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Episode N',
  );
  for (const name of ['Companions', 'Satchel', 'Journal'])
    expect(screen.getByRole('heading', { name })).toBeTruthy();
  expect(screen.getByRole('figure', { name: 'Tavern map' })).toBeTruthy();
  expect(screen.queryByText(/Protocol version/)).toBeNull();
});
test('renders real party, inventory, HP, gold, narration and a named roll stamp', () => {
  const { store } = setup();
  act(() => store.getState().receive(result([event('CheckRolled')]), 10));
  expect(screen.getByText('The board gives with a dry creak.')).toBeTruthy();
  expect(
    screen.getByText('Kael · Perception 15 vs DC 15 → success'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: /Ilsa.*8\/12 HP/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Rope/ })).toBeTruthy();
  expect(screen.getByText('◎ 20 gold')).toBeTruthy();
});
test('disables the composer while a beat runs and presents CLI status text', () => {
  const { store } = setup();
  act(() => {
    store.getState().receive({ type: 'beat_started', beat: 1 }, 10);
    store.getState().receive(
      {
        type: 'beat_progress',
        beat: 1,
        progress: { kind: 'status', phase: 'dm', toolCalls: 2 },
      },
      20,
    );
  });
  expect(
    screen
      .getByRole('textbox', { name: 'Your intent' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.getByRole('button', { name: 'Write' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByText('DM is resolving… 2 actions')).toBeTruthy();
  act(() => store.getState().receive(result(), 30));
  expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(false);
});
test('party and satchel clicks toggle selection; chips and Escape clear it', () => {
  const { store } = setup();
  const party = screen.getByRole('button', { name: /Ilsa.*HP/ });
  fireEvent.click(party);
  expect(store.getState().selection.ids).toEqual(['char:ilsa']);
  expect(party.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(party);
  expect(store.getState().selection.ids).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /Rope/ }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Rope from selection' }),
  );
  expect(store.getState().selection.ids).toEqual([]);
  fireEvent.click(party);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(store.getState().selection.ids).toEqual([]);
});
test('Write submits selected IDs and text through the provided connection', () => {
  const { send } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Ilsa.*HP/ }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Ask about Brann.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Write' }));
  expect(send).toHaveBeenCalledWith({
    type: 'player_intent',
    selection: ['char:ilsa'],
    text: 'Ask about Brann.',
  });
});
test('renders provisional and withdrawn dialogue accessibly', () => {
  const { store } = setup();
  act(() =>
    store.getState().receive(
      {
        type: 'beat_progress',
        beat: 1,
        progress: {
          kind: 'peer_line',
          speaker: 'char:ilsa',
          text: 'One moment.',
        },
      },
      0,
    ),
  );
  expect(screen.getByText('(provisional)')).toBeTruthy();
  act(() =>
    store.getState().receive(
      {
        type: 'paused',
        beat: 1,
        attempt: 0,
        reason: 'budget',
        retryInMs: null,
      },
      1,
    ),
  );
  expect(screen.getByText('One moment.').tagName).toBe('S');
  expect(screen.getByText('(withdrawn)')).toBeTruthy();
});
test('appendix bookmarks open and close a placeholder without losing composition', () => {
  setup();
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Keep this thought.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
  expect(
    screen.getByRole('heading', { name: 'Appendix · graph' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'close ×' }));
  expect(screen.getByDisplayValue('Keep this thought.')).toBeTruthy();
});
