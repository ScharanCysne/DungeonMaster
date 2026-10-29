import type { EntityId } from '@dungeon/shared';
import { describe, expect, it } from 'vitest';
import { freeze, snapshot } from '../testing/fixtures';
import { applyClientAction } from './actions';
import { applyServerMessage } from './reducer';
import { createInitialState } from './types';

const seeded = () => applyServerMessage(createInitialState(), snapshot);
describe('local actions', () => {
  it('toggles ordered selections without mutating inputs', () => {
    let state = seeded();
    state = applyClientAction(freeze(state), {
      type: 'selection_toggle',
      id: 'char:ilsa',
    });
    state = applyClientAction(freeze(state), {
      type: 'selection_toggle',
      id: 'char:player',
    });
    expect(state.selection.ids).toEqual(['char:ilsa', 'char:player']);
    state = applyClientAction(freeze(state), {
      type: 'selection_toggle',
      id: 'char:ilsa',
    });
    expect(state.selection.ids).toEqual(['char:player']);
    state = applyClientAction(state, {
      type: 'selection_toggle',
      id: 'char:ilsa',
    });
    expect(state.selection.ids).toEqual(['char:player', 'char:ilsa']);
  });
  it('rejects a seventh selection with a hint, resets the hint on removal, and clears all', () => {
    let state = seeded();
    for (const entity of snapshot.entities)
      state = applyClientAction(state, {
        type: 'selection_toggle',
        id: entity.id,
      });
    expect(state.selection.ids).toHaveLength(6);
    expect(state.selection.tooMany).toBe(true);
    state = applyClientAction(state, {
      type: 'selection_toggle',
      id: 'char:player',
    });
    expect(state.selection).toMatchObject({ tooMany: false });
    state = applyClientAction(state, { type: 'selection_clear' });
    expect(state.selection).toEqual({ ids: [], tooMany: false });
  });
  it('does not select unknown or dev-only entities', () => {
    const state = seeded();
    expect(
      applyClientAction(state, { type: 'selection_toggle', id: 'char:secret' }),
    ).toBe(state);
  });
  it('caps text, records submitted history, clears selection, and recalls text', () => {
    let state = applyClientAction(seeded(), {
      type: 'composer_text',
      text: 'x'.repeat(501),
    });
    expect(state.composer.text).toHaveLength(500);
    const selection: EntityId[] = ['char:ilsa'];
    const intent = {
      type: 'player_intent',
      selection,
      text: 'Ask Ilsa.',
    } as const;
    state = applyClientAction(freeze(state), { type: 'intent_sent', intent });
    expect(state.composer).toEqual({
      text: '',
      history: [intent],
      pending: intent,
    });
    expect(state.selection.ids).toEqual([]);
    expect(
      applyClientAction(state, { type: 'composer_recall' }).composer.text,
    ).toBe('Ask Ilsa.');
  });
  it('toggles developer options and appendix, selects an agent, preserving the game state', () => {
    const initial = seeded();
    let state = applyClientAction(freeze(initial), {
      type: 'dev_toggle',
      key: 'dmView',
    });
    state = applyClientAction(state, { type: 'dev_toggle', key: 'inspector' });
    state = applyClientAction(state, { type: 'dev_toggle', key: 'devTools' });
    state = applyClientAction(state, { type: 'agent', id: 'char:ilsa' });
    state = applyClientAction(state, { type: 'appendix', tab: 'graph' });
    expect(state.dev).toMatchObject({
      dmView: true,
      inspector: true,
      devTools: false,
      chosenAgent: 'char:ilsa',
      appendixTab: 'graph',
    });
    expect(
      applyClientAction(state, { type: 'appendix', tab: 'graph' }).dev
        .appendixTab,
    ).toBeNull();
    expect(state.world).toBe(initial.world);
    expect(state.composer).toBe(initial.composer);
  });
});
