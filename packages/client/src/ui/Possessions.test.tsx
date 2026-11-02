import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createClientStore } from '../store';
import { event, result, snapshot } from '../testing/fixtures';
import { journalEntries } from '../testing/journal';
import { manifest } from '../map/assets';
import { resolveFrame } from '../map/renderModel';
import { isCharacter } from '../store/world';

vi.mock('../map/game', () => ({ createMapGame: () => ({ destroy() {} }) }));
vi.mock('../map/texture', () => ({
  sheetSnapshot: () => 'data:image/png;base64,c2hlZXQ=',
  subscribeSheet: () => () => {},
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup() {
  const store = createClientStore();
  store.getState().receive(
    {
      ...snapshot,
      entities: snapshot.entities.map((node) =>
        node.id === 'char:ilsa'
          ? {
              ...node,
              hp: 0,
              conscious: false,
              tags: ['rogue'],
              summary: 'Halfling rogue, level 5; always smiling.',
            }
          : node,
      ),
    },
    0,
  );
  store.setState({ journal: { entries: journalEntries, reveal: null } });
  render(<App store={store} />);
  return store;
}
it('renders type-coloured names, optional class and level, AC, HP and down state', () => {
  setup();
  const card = screen.getByRole('button', { name: /Ilsa.*HP.*down/ });
  expect(card.classList.contains('down')).toBe(true);
  expect(within(card).getByText('rogue · level 5')).toBeTruthy();
  expect(within(card).getByText('AC 11')).toBeTruthy();
  expect(within(card).getByRole('progressbar').getAttribute('value')).toBe('0');
  expect(within(card).getByRole('progressbar').getAttribute('max')).toBe('12');
  expect(within(card).getByText('Ilsa').classList.contains('speaker')).toBe(
    true,
  );
});
it.each([/Ilsa.*HP/, /Rope/])(
  'toggles %s by click and Enter with a pressed selection state',
  (name) => {
    const store = setup();
    const card = screen.getByRole('button', { name });
    fireEvent.click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(store.getState().selection.ids).toHaveLength(1);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(store.getState().selection.ids).toEqual([]);
    fireEvent.keyDown(card, { key: 'Enter', repeat: true });
    expect(store.getState().selection.ids).toEqual([]);
  },
);
it('shows rarity, equipped and latest-beat new badges alongside gold', () => {
  const store = setup();
  act(() =>
    store.getState().receive(
      result([
        event('ItemTransferred', {
          itemId: 'item:quill',
          from: { kind: 'container', id: 'container:box' },
          to: { kind: 'character', id: 'char:player' },
          reason: 'pick_up',
          goldChanges: [],
        }),
        event(
          'ItemEquipped',
          {
            characterId: 'char:player',
            itemId: 'item:quill',
            slot: 'main_hand',
          },
          { seq: 1 },
        ),
      ]),
      1,
    ),
  );
  const row = screen.getByRole('button', { name: /Quill rare equipped new/ });
  expect(row.classList.contains('rarity-rare')).toBe(true);
  expect(screen.getByText('◎ 20 gold')).toBeTruthy();
  fireEvent.keyDown(row, { key: 'Enter' });
  expect(store.getState().selection.ids).toEqual(['item:quill']);
  act(() => store.getState().receive(result([], 2), 2));
  expect(within(row).queryByText('new')).toBeNull();
  expect(within(row).getByText('equipped')).toBeTruthy();
});
it('uses the map frame resolver and shared recoloured image without a portrait canvas', () => {
  setup();
  const ilsa = snapshot.entities.find((node) => node.id === 'char:ilsa');
  if (!isCharacter(ilsa)) throw new Error('Missing character');
  const portrait = screen
    .getByRole('button', { name: /Ilsa.*HP/ })
    .querySelector('.sprite');
  expect(portrait?.getAttribute('data-frame')).toBe(
    String(resolveFrame(ilsa, manifest)),
  );
  expect(portrait?.getAttribute('style')).toContain(
    'data:image/png;base64,c2hlZXQ=',
  );
  expect(document.querySelector('canvas')).toBeNull();
});
it('keeps cards, satchel rows and journal chips in document tab order', () => {
  setup();
  const cards = screen
    .getAllByRole('button')
    .filter((button) =>
      button.matches('.party-card, .item-row, .journal-chips .chip'),
    );
  expect(cards.map((card) => card.textContent)).toEqual([
    expect.stringContaining('Kael'),
    expect.stringContaining('Ilsa'),
    expect.stringContaining('Rope'),
    'Old box',
  ]);
  expect(cards.every((card) => card.tabIndex === 0)).toBe(true);
});
