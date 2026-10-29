import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { createClientStore } from '../store';
import { createMapGame } from './game';
import { MapView } from './MapView';

vi.mock('./game', () => ({
  createMapGame: vi.fn(() => ({ destroy: vi.fn() })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('mounts one game, keeps it through rerenders, and destroys it once on unmount', () => {
  const store = createClientStore();
  const view = render(<MapView store={store} />);
  expect(createMapGame).toHaveBeenCalledTimes(1);
  expect(createMapGame).toHaveBeenCalledWith(screen.getByRole('img'), store);
  view.rerender(<MapView store={store} />);
  act(() =>
    store.getState().dispatch({ type: 'composer_text', text: 'Hello' }),
  );
  expect(createMapGame).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('img').hasAttribute('tabindex')).toBe(false);
  const game = vi.mocked(createMapGame).mock.results[0];
  if (game?.type !== 'return') throw new Error('Game was not created');
  view.unmount();
  expect(game.value.destroy).toHaveBeenCalledTimes(1);
});
test('changing the store disposes the old bridge and game', () => {
  const view = render(<MapView store={createClientStore()} />);
  const first = vi.mocked(createMapGame).mock.results[0];
  if (first?.type !== 'return') throw new Error('Game was not created');
  view.rerender(<MapView store={createClientStore()} />);
  expect(first.value.destroy).toHaveBeenCalledTimes(1);
  expect(createMapGame).toHaveBeenCalledTimes(2);
});
