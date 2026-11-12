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
import { result, snapshot } from '../testing/fixtures';
import { debugGraph } from '../testing/dev';

vi.mock('../map/game', () => ({ createMapGame: () => ({ destroy() {} }) }));
vi.mock('../dev/cytoscapeAdapter', () => ({
  mountGraph: () => ({ destroy() {} }),
}));
afterEach(cleanup);

test.each([false, true])(
  'timeline seeks and all views use the selected world (Inspector %s)',
  (inspector) => {
    const store = createClientStore();
    store
      .getState()
      .dispatch({ type: 'connection', status: 'open', retries: 0 });
    store
      .getState()
      .receive({ type: 'debug_response', kind: 'graph', data: debugGraph }, 0);
    if (inspector)
      store.getState().dispatch({ type: 'dev_toggle', key: 'inspector' });
    store
      .getState()
      .receive(
        { type: 'replay_info', sessionId: 'run', beats: 2, ended: false },
        0,
      );
    store.getState().receive(
      {
        type: 'replay_state',
        snapshot,
        results: [],
        groundTruth: debugGraph,
      },
      0,
    );
    const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
    render(<App store={store} send={send} />);
    expect(
      screen.getByRole('navigation', { name: 'Replay timeline' }),
    ).toBeTruthy();
    expect(screen.getByText('Beat 0 of 2')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Replay - read only')).toBeTruthy();
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Write' }).hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(send).toHaveBeenLastCalledWith({ type: 'replay_seek', beat: 1 });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
    expect(send).toHaveBeenLastCalledWith({ type: 'replay_seek', beat: 2 });
    act(() =>
      store.getState().receive(
        {
          type: 'replay_state',
          snapshot: {
            ...snapshot,
            beat: 2,
            inventory: [],
            entities: snapshot.entities.map((node) =>
              'hp' in node && node.id === 'char:ilsa'
                ? { ...node, hp: 2 }
                : node,
            ),
            positions: [
              {
                entityId: 'char:player',
                locationId: 'loc:room',
                tile: { x: 4, y: 5 },
              },
            ],
          },
          results: [result([], 2)],
          groundTruth: { nodes: [], edges: [] },
        },
        1,
      ),
    );
    expect(screen.getByText('Beat 2 of 2')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: /Ilsa.*2.*HP/ })).toBeTruthy();
    expect(store.getState().world.inventory).toEqual([]);
    expect(store.getState().world.positions['char:player']?.tile).toEqual({
      x: 4,
      y: 5,
    });
    expect(store.getState().dev.groundTruth).toEqual({ nodes: [], edges: [] });
    expect(store.getState().dev.graph).toBeNull();
    expect(
      store.getState().journal.entries.some((entry) => entry.beat === 2),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(send).toHaveBeenLastCalledWith({ type: 'replay_seek', beat: 1 });
    act(() =>
      store
        .getState()
        .receive({ type: 'replay_state', snapshot, results: [] }, 2),
    );
    expect(store.getState().journal.entries).toEqual([]);
    expect(store.getState().dev.groundTruth).toBeNull();
    expect(screen.getByText('Beat 0 of 2')).toBeTruthy();
  },
);
