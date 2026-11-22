import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ClientMessage, PauseReason } from '@dungeon/shared';
import { App } from '../App';
import { createClientStore } from '../store';
import { event, result, snapshot } from '../testing/fixtures';
import { debugGraph } from '../testing/dev';

vi.mock('../map/game', () => ({ createMapGame: () => ({ destroy() {} }) }));
vi.mock('../dev/cytoscapeAdapter', () => ({
  mountGraph: () => ({ destroy() {} }),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(dev = false, inspector = false) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createClientStore();
  store.getState().receive(snapshot, 0);
  store.getState().dispatch({ type: 'connection', status: 'open', retries: 0 });
  if (dev)
    store
      .getState()
      .receive({ type: 'debug_response', kind: 'graph', data: debugGraph }, 0);
  if (inspector)
    store.getState().dispatch({ type: 'dev_toggle', key: 'inspector' });
  const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
  render(<App store={store} send={send} />);
  const pause = (reason: PauseReason, retryInMs: number | null = 5000) =>
    act(() =>
      store.getState().receive(
        {
          type: 'paused',
          reason,
          beat: 1,
          attempt: 0,
          retryInMs,
          budgetStepUsd: 2.5,
          ...(dev ? { errorCode: 'TEST_FAILURE', traceId: 'beat-1-0' } : {}),
        },
        Date.now(),
      ),
    );
  return { store, send, pause };
}

test.each([
  ['llm_unavailable', 'The storyteller is temporarily unavailable.'],
  ['graph_unavailable', 'The world archive is temporarily unavailable.'],
  ['internal_error', 'Something went wrong while writing this beat.'],
] satisfies [PauseReason, string][])(
  'shows plain words and sends pause commands for %s',
  (reason, text) => {
    const { pause, send } = setup();
    pause(reason, null);
    expect(screen.getByRole('dialog').textContent).toContain(text);
    expect(
      screen.getByText('Waiting for you. Automatic retries have stopped.'),
    ).toBeTruthy();
    expect(screen.queryByText('TEST_FAILURE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'session_command',
      command: 'retry_now',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and quit' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'session_command',
      command: 'save_and_quit',
    });
  },
);

test.each([false, true])(
  'countdown ticks, trace opens and resumed clears the overlay (Inspector %s)',
  (inspector) => {
    const { store, send, pause } = setup(true, inspector);
    act(() => {
      store.getState().receive({ type: 'beat_started', beat: 1 }, 0);
      store.getState().receive(
        {
          type: 'beat_progress',
          beat: 1,
          progress: {
            kind: 'peer_line',
            speaker: 'char:ilsa',
            text: 'Perhaps…',
          },
        },
        0,
      );
    });
    pause('llm_unavailable');
    expect(screen.getByText('Automatic retry in 5s.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText('Automatic retry in 3s.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Checking whether we can continue…')).toBeTruthy();
    expect(
      store
        .getState()
        .journal.entries.find((entry) => entry.kind === 'dialogue'),
    ).toMatchObject({ status: 'struck' });
    expect(screen.getByText('TEST_FAILURE')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Trace for beat 1' }));
    expect(send).toHaveBeenCalledWith({
      type: 'debug_request',
      kind: 'trace',
      target: 'beat-1-0',
    });
    expect(store.getState().dev.traceFocus).toBe('beat-1-0');
    act(() =>
      store.getState().receive({ type: 'resumed', beat: 1 }, Date.now()),
    );
    expect(
      screen.queryByRole('dialog', { name: 'A pause in the tale' }),
    ).toBeNull();
  },
);

test('budget uses the advertised step and stop saves; save acknowledgement closes the overlay', () => {
  const { pause, send, store } = setup();
  pause('budget', null);
  expect(screen.getByRole('dialog').textContent).toContain('spending limit');
  fireEvent.click(screen.getByRole('button', { name: 'Raise by $2.5' }));
  expect(send).toHaveBeenLastCalledWith({
    type: 'session_command',
    command: 'raise_budget',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(send).toHaveBeenLastCalledWith({
    type: 'session_command',
    command: 'save_and_quit',
  });
  expect(screen.queryByRole('button', { name: 'Retry now' })).toBeNull();
  act(() =>
    store
      .getState()
      .receive({ type: 'session_saved', sessionId: 'run', beat: 0 }, 1),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(
    screen.getByText('Session saved. You can close the book.'),
  ).toBeTruthy();
  expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
});

test.each([false, true])(
  'chapter page shows witnessed acquisition, recap, peer hook and dev actions (Inspector %s)',
  (inspector) => {
    const { store, send } = setup(true, inspector);
    act(() => {
      store.getState().receive(
        result([
          event('ItemTransferred', {
            itemId: 'item:quill',
            from: { kind: 'container', id: 'container:box' },
            to: { kind: 'character', id: 'char:ilsa' },
            reason: 'steal',
            goldChanges: [],
          }),
        ]),
        1,
      );
      store.getState().receive(
        {
          type: 'episode_ended',
          beat: 1,
          holder: 'char:ilsa',
          summary: 'Your search ended in a daring theft.',
        },
        2,
      );
    });
    expect(
      screen.getByRole('heading', { name: 'End of chapter' }),
    ).toBeTruthy();
    expect(screen.getByText('Ilsa holds the quill.')).toBeTruthy();
    expect(screen.getByText('Stole it from Old box.')).toBeTruthy();
    expect(screen.getByText('1 beat played')).toBeTruthy();
    expect(
      screen.getByText('Your search ended in a daring theft.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('complementary', { name: 'Next episode hook' })
        .textContent,
    ).toContain('own agenda');
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Replay this session' }),
    );
    expect(send).toHaveBeenLastCalledWith({
      type: 'session_command',
      command: 'replay_session',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start a new run' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'session_command',
      command: 'start_new_run',
    });
  },
);

test('unwitnessed acquisition says out of sight; player ending has no peer hook or production actions', () => {
  const { store } = setup();
  act(() =>
    store.getState().receive(
      {
        type: 'episode_ended',
        beat: 3,
        holder: 'char:player',
        summary: 'The tale is told.',
      },
      1,
    ),
  );
  expect(screen.getByText('Out of sight.')).toBeTruthy();
  expect(screen.getByText('3 beats played')).toBeTruthy();
  expect(
    screen.queryByRole('complementary', { name: 'Next episode hook' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Replay this session' }),
  ).toBeNull();
});
