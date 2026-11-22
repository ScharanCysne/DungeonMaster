import { expect, test } from 'vitest';
import { graphSchema } from '@dungeon/shared';
import { container } from '../../../shared/src/testing/fixtures';
import { debugGraph } from '../testing/dev';
import { result } from '../testing/fixtures';
import { renderModel } from './renderModel';
import { mapStore } from './testing';
import { manifest, tavernMap } from './assets';
import { dmOverlay } from './dmOverlay';

test('DM overlays need both enabled DM mode and ground truth', () => {
  const store = mapStore();
  const truth = graphSchema.parse({
    ...debugGraph,
    nodes: [
      ...debugGraph.nodes,
      {
        ...container,
        id: 'container:hidden',
        name: 'Hidden brick',
        tile: { x: 8, y: 8 },
      },
    ],
  });
  store.getState().receive({ ...result(), groundTruth: truth }, 1);
  const model = () => renderModel(store.getState(), manifest, tavernMap);
  expect(
    model().sprites.some((sprite) => sprite.id === 'container:hidden'),
  ).toBe(false);
  store.getState().dispatch({ type: 'dev_toggle', key: 'dmView' });
  expect(
    model().sprites.find((sprite) => sprite.id === 'container:hidden'),
  ).toMatchObject({ x: 8, y: 8, dmOnly: true, dmNote: 'hidden' });
  expect(
    model().sprites.find((sprite) => sprite.id === 'container:box')?.dmNote,
  ).toContain('holds item:quill');
  expect(
    model().sprites.find((sprite) => sprite.id === 'char:hidden')?.dmNote,
  ).toContain('tile unknown');
  store
    .getState()
    .receive({ type: 'error', code: 'DEBUG_DISABLED', message: 'Disabled' }, 2);
  expect(model().sprites.some((sprite) => sprite.dmNote)).toBe(false);
});
test('absent ground truth is harmless and invalid or cyclic placement is omitted', () => {
  const store = mapStore();
  store
    .getState()
    .receive({ type: 'debug_response', kind: 'graph', data: debugGraph }, 1);
  store.getState().dispatch({ type: 'dev_toggle', key: 'dmView' });
  expect(
    renderModel(store.getState(), manifest, tavernMap).sprites.some(
      (sprite) => sprite.dmOnly,
    ),
  ).toBe(false);
  expect(
    dmOverlay(
      { ...debugGraph, edges: [] },
      { ...store.getState().world, positions: {} },
    ).some((overlay) => overlay.entity.id === 'char:hidden'),
  ).toBe(false);
});

test('marks only concealed things, not items an NPC carries out of sight', () => {
  const store = mapStore();
  const truth = graphSchema.parse({
    ...debugGraph,
    edges: [
      ...debugGraph.edges,
      {
        type: 'CARRIES',
        from: 'char:brann',
        to: 'item:rope',
        properties: {},
        createdBy: 'seed',
        createdAtBeat: 0,
      },
    ],
  });
  const overlay = dmOverlay(truth, store.getState().world);
  expect(overlay.some(({ entity }) => entity.id === 'char:brann')).toBe(false);
  expect(overlay.some(({ entity }) => entity.id === 'item:rope')).toBe(false);
  expect(overlay.some(({ entity }) => entity.id === 'item:quill')).toBe(false);
  expect(
    overlay.find(({ entity }) => entity.id === 'container:box')?.note,
  ).toContain('holds item:quill');
});
