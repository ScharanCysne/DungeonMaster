import type { EntityId } from '@dungeon/shared';
import { expect, test, vi } from 'vitest';
import { event, result } from '../testing/fixtures';
import { manifest, tavernMap } from './assets';
import { connectMap } from './bridge';
import type { MapScenePort } from './bridge';
import type { RenderModel } from './renderModel';
import { mapStore, moved } from './testing';

function setup() {
  const store = mapStore();
  const clicks = new Set<(event: { id: EntityId }) => void>();
  const models: RenderModel[] = [];
  const scene: MapScenePort = {
    setModel: vi.fn((model: RenderModel) => {
      models.push(model);
    }),
    on: (_event, listener) => {
      clicks.add(listener);
    },
    off: (_event, listener) => {
      clicks.delete(listener);
    },
  };
  const bridge = connectMap(store, scene, manifest, tavernMap);
  return {
    store,
    scene,
    bridge,
    clicks,
    latest: () => models.at(-1),
    click: (id: EntityId) => clicks.forEach((listener) => listener({ id })),
  };
}
test('entity-clicked toggles selection and pushes the resulting model', () => {
  const { store, scene, click, bridge, latest } = setup();
  expect(scene.setModel).toHaveBeenCalledTimes(1);
  click('char:ilsa');
  expect(store.getState().selection.ids).toEqual(['char:ilsa']);
  expect(latest()?.sprites.find(({ id }) => id === 'char:ilsa')?.selected).toBe(
    true,
  );
  click('char:ilsa');
  expect(store.getState().selection.ids).toEqual([]);
  click('char:absent');
  click('item:rope');
  expect(store.getState().selection.ids).toEqual([]);
  expect(scene.setModel).toHaveBeenCalledTimes(3);
  bridge.destroy();
});
test('world, latest beat changes, movement, cues and reduced motion push models', () => {
  const { store, bridge, latest } = setup();
  store.getState().receive(
    {
      type: 'beat_progress',
      beat: 1,
      progress: { kind: 'map_cue', entity: 'char:ilsa', cue: 'glance_up' },
    },
    1,
  );
  expect(latest()?.cues[0]?.kind).toBe('glance_up');
  bridge.setReducedMotion(true);
  expect(latest()?.cues).toEqual([]);
  store.getState().receive(
    result([
      moved('char:player', [
        { x: 1, y: 2 },
        { x: 1, y: 3 },
      ]),
    ]),
    2,
  );
  expect(
    latest()?.sprites.find(({ id }) => id === 'char:player'),
  ).toMatchObject({ x: 1, y: 3, changed: true });
  expect(latest()?.tweens[0]?.durationMs).toBe(0);
  bridge.setReducedMotion(false);
  expect(latest()?.tweens[0]?.durationMs).toBe(125);
  store
    .getState()
    .receive(result([event('EntityHidden', { entityId: 'char:ilsa' })], 2), 3);
  expect(latest()?.sprites.some(({ id }) => id === 'char:ilsa')).toBe(false);
  bridge.destroy();
});
test('unrelated state does not redraw and cleanup removes both subscriptions', () => {
  const { store, scene, bridge, clicks } = setup();
  store.getState().dispatch({ type: 'composer_text', text: 'Hello' });
  expect(scene.setModel).toHaveBeenCalledTimes(1);
  bridge.destroy();
  expect(clicks.size).toBe(0);
  store.getState().dispatch({ type: 'selection_toggle', id: 'char:ilsa' });
  expect(scene.setModel).toHaveBeenCalledTimes(1);
});
