import { expect, test } from 'vitest';
import { applyServerMessage } from './reducer';
import { applyClientAction } from './actions';
import { createInitialState } from './types';
import { debugGraph, debugKnowledge, debugTrace } from '../testing/dev';
import { freeze, result } from '../testing/fixtures';

const disabled = {
  type: 'error',
  code: 'DEBUG_DISABLED',
  message: 'Disabled',
} as const;
test('developer mode starts unknown and local toggles cannot authorize it', () => {
  const initial = freeze(createInitialState());
  expect(initial.dev.devTools).toBe(false);
  expect(
    applyClientAction(initial, { type: 'dev_toggle', key: 'inspector' }),
  ).toBe(initial);
  expect(
    applyClientAction(initial, { type: 'dev_toggle', key: 'dmView' }),
  ).toBe(initial);
  expect(applyServerMessage(initial, result()).dev.devTools).toBe(false);
});
test('ground truth proves dev mode and only populates the dev slice', () => {
  const state = applyServerMessage(freeze(createInitialState()), {
    ...result(),
    groundTruth: debugGraph,
  });
  expect(state.dev.devTools).toBe(true);
  expect(state.dev.groundTruth).toEqual(debugGraph);
  expect(state.world.entities).toEqual({});
  expect(applyServerMessage(state, result([], 2)).dev.groundTruth).toBeNull();
});
test('each successful debug response proves dev mode and caches its payload', () => {
  let state = createInitialState();
  state = applyServerMessage(freeze(state), {
    type: 'debug_response',
    kind: 'graph',
    data: debugGraph,
  });
  expect(state.dev.devTools).toBe(true);
  expect(state.dev.graph).toEqual(debugGraph);
  state = applyServerMessage(freeze(state), {
    type: 'debug_response',
    kind: 'knowledge',
    data: debugKnowledge,
  });
  expect(state.dev.knowledge['char:player']).toEqual(debugKnowledge);
  state = applyServerMessage(freeze(state), {
    type: 'debug_response',
    kind: 'trace',
    data: debugTrace,
  });
  expect(state.dev.traces['beat-1']).toEqual(debugTrace);
});
test('DEBUG_DISABLED calmly clears dev data and overlays without touching the draft', () => {
  let state = applyServerMessage(createInitialState(), {
    ...result(),
    groundTruth: debugGraph,
  });
  state = applyClientAction(state, { type: 'dev_toggle', key: 'dmView' });
  state = applyClientAction(state, { type: 'dev_toggle', key: 'inspector' });
  state = applyClientAction(state, { type: 'composer_text', text: 'Keep me' });
  state = applyServerMessage(freeze(state), disabled);
  expect(state.dev).toMatchObject({
    devTools: false,
    dmView: false,
    inspector: false,
    groundTruth: null,
    error: disabled,
  });
  expect(state.composer.text).toBe('Keep me');
  expect(state.connection.error).toBeNull();
  expect(
    applyServerMessage(state, {
      type: 'debug_response',
      kind: 'graph',
      data: debugGraph,
    }).dev.error,
  ).toBeNull();
});
