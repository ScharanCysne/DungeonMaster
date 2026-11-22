import { characterSchema, containerSchema, itemSchema } from '@dungeon/shared';
import { expect, test } from 'vitest';
import {
  character,
  container,
  item,
} from '../../../shared/src/testing/fixtures';
import { event, result, snapshot } from '../testing/fixtures';
import { manifest, tavernMap } from './assets';
import { ROLE_INK } from './palette';
import { renderModel, resolveFrame } from './renderModel';
import { mapStore, moved } from './testing';

test('frame resolution: persisted sprite, override, first matching tag, then kind fallback', () => {
  const npc = characterSchema.parse({
    ...character,
    id: 'char:kael',
    tags: ['rogue', 'fighter'],
  });
  expect(resolveFrame({ ...npc, sprite: 'kenney-1-bit:9' }, manifest)).toBe(9);
  expect(resolveFrame(npc, manifest)).toBe(74);
  expect(resolveFrame({ ...npc, id: 'char:new' }, manifest)).toBe(124);
  expect(
    resolveFrame(
      { ...npc, id: 'char:new', tags: ['unmatched', 'fighter'] },
      manifest,
    ),
  ).toBe(77);
  expect(resolveFrame({ ...npc, id: 'char:new', tags: [] }, manifest)).toBe(25);
  expect(
    resolveFrame(containerSchema.parse({ ...container, tags: [] }), manifest),
  ).toBe(302);
  expect(
    resolveFrame(
      itemSchema.parse({ ...item, id: 'item:new', kind: 'document', tags: [] }),
      manifest,
    ),
  ).toBe(290);
  expect(
    resolveFrame(
      itemSchema.parse({ ...item, id: 'item:new', tags: [] }),
      manifest,
    ),
  ).toBe(237);
});
test('draws only floor, walls and furniture in order, with gid minus one', () => {
  const model = renderModel(mapStore().getState(), manifest, tavernMap);
  expect(tavernMap).toMatchObject({ width: 26, height: 16 });
  expect([...new Set(model.tiles.map(({ layer }) => layer))]).toEqual([
    'floor',
    'walls',
    'furniture',
  ]);
  expect(model.tiles[0]).toEqual({ frame: 0, x: 0, y: 0, layer: 'floor' });
  expect(model.tiles).toBe(tavernMap.tiles);
});
test('selection, labels, positions and subtle role inks are projected from the store', () => {
  const store = mapStore();
  store.getState().dispatch({ type: 'selection_toggle', id: 'char:ilsa' });
  const model = renderModel(store.getState(), manifest, tavernMap);
  expect(model.sprites.find(({ id }) => id === 'char:ilsa')).toMatchObject({
    x: 2,
    y: 2,
    tint: ROLE_INK.peer,
    selected: true,
    label: 'Ilsa',
  });
  expect(model.sprites.find(({ id }) => id === 'char:player')).toMatchObject({
    tint: ROLE_INK.player,
    selected: false,
    changed: false,
  });
  expect(model.sprites.find(({ id }) => id === 'char:brann')?.tint).toBe(
    ROLE_INK.npc,
  );
  expect(model.sprites.find(({ id }) => id === 'item:quill')?.tint).toBeNull();
});
test('hidden, absent, unpositioned, carried and out-of-bounds entities never render', () => {
  const store = mapStore();
  const state = store.getState();
  const hidden = containerSchema.parse({
    ...container,
    id: 'container:hidden',
  });
  const model = renderModel(
    {
      ...state,
      world: {
        ...state.world,
        entities: { ...state.world.entities, [hidden.id]: hidden },
        positions: {
          ...state.world.positions,
          'container:hidden': { locationId: 'loc:room', tile: { x: 1, y: 1 } },
          'char:absent': { locationId: 'loc:room', tile: { x: 1, y: 1 } },
          'char:ilsa': { locationId: 'loc:room', tile: { x: 26, y: 1 } },
        },
      },
    },
    manifest,
    tavernMap,
  );
  expect(model.sprites.map(({ id }) => id)).toEqual([
    'char:player',
    'char:brann',
    'item:quill',
    'container:box',
  ]);
  expect(
    renderModel(
      { ...state, world: { ...state.world, positions: {} } },
      manifest,
      tavernMap,
    ).sprites,
  ).toEqual([]);
});
test('changes survive snapshot refresh, then clear at the next beat start or result', () => {
  const store = mapStore();
  store.getState().receive(result([event('ContainerOpened')]), 1);
  const model = () => renderModel(store.getState(), manifest, tavernMap);
  expect(
    model().sprites.find(({ id }) => id === 'container:box')?.changed,
  ).toBe(true);
  store.getState().receive(
    {
      ...snapshot,
      beat: 1,
      positions: [
        {
          entityId: 'container:box',
          locationId: 'loc:room',
          tile: { x: 4, y: 2 },
        },
      ],
    },
    2,
  );
  expect(model().sprites[0]?.changed).toBe(true);
  store.getState().receive({ type: 'beat_started', beat: 2 }, 3);
  expect(model().sprites.every(({ changed }) => !changed)).toBe(true);
  store.getState().receive(result([event('ContainerUnlocked')], 2), 4);
  expect(model().sprites[0]?.changed).toBe(true);
  store.getState().receive(result([], 3), 5);
  expect(model().sprites[0]?.changed).toBe(false);
});
test('replay and unwitnessed events cannot animate or mark the map', () => {
  const store = mapStore();
  store
    .getState()
    .receive(
      result([event('ContainerOpened', undefined, { witnesses: [] })]),
      1,
    );
  expect(store.getState().mapFeedback.changed).toEqual([]);
  store.getState().receive({ ...snapshot, beat: 4 }, 2);
  store.getState().receive(
    result(
      [
        moved('char:player', [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ]),
      ],
      3,
    ),
    3,
  );
  expect(renderModel(store.getState(), manifest, tavernMap).tweens).toEqual([]);
  expect(store.getState().mapFeedback.changed).toEqual([]);
});
test('movement preserves exact engine paths and event order at eight tiles per second', () => {
  const store = mapStore();
  const path = [
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
  ];
  const next = [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ];
  store
    .getState()
    .receive(
      result([moved('char:player', path, 1), moved('char:ilsa', next, 2)]),
      1,
    );
  const model = renderModel(store.getState(), manifest, tavernMap);
  expect(
    model.tweens.map(({ id, path, startMs, durationMs }) => ({
      id,
      path,
      startMs,
      durationMs,
    })),
  ).toEqual([
    { id: 'char:player', path, startMs: 0, durationMs: 250 },
    { id: 'char:ilsa', path: next, startMs: 250, durationMs: 125 },
  ]);
  const reduced = renderModel(store.getState(), manifest, tavernMap, true);
  expect(reduced.tweens.map(({ durationMs }) => durationMs)).toEqual([0, 0]);
  expect(reduced.sprites.find(({ id }) => id === 'char:player')).toMatchObject({
    x: 2,
    y: 3,
  });
  store
    .getState()
    .receive(result([event('EntityHidden', { entityId: 'char:ilsa' })], 2), 2);
  expect(
    renderModel(store.getState(), manifest, tavernMap).sprites.some(
      ({ id }) => id === 'char:ilsa',
    ),
  ).toBe(false);
});
test('cues require visible actors and targets and disappear on pause or reduced motion', () => {
  const store = mapStore();
  for (const target of ['char:player', 'char:absent'] as const)
    store.getState().receive(
      {
        type: 'beat_progress',
        beat: 1,
        progress: {
          kind: 'map_cue',
          entity: 'char:ilsa',
          cue: 'look_at',
          target,
        },
      },
      1,
    );
  const state = store.getState();
  expect(renderModel(state, manifest, tavernMap).cues).toEqual([
    { key: '1:0', id: 'char:ilsa', kind: 'look_at', flipX: true },
  ]);
  expect(renderModel(state, manifest, tavernMap, true).cues).toEqual([]);
  store.getState().receive(
    {
      type: 'paused',
      beat: 1,
      reason: 'budget',
      retryInMs: null,
      attempt: 1,
    },
    2,
  );
  expect(renderModel(store.getState(), manifest, tavernMap).cues).toEqual([]);
});
test('labels a character by the first word of its name, without punctuation', () => {
  const store = mapStore();
  store.getState().dispatch({ type: 'selection_toggle', id: 'char:brann' });
  const state = store.getState();
  const brann = state.world.entities['char:brann'];
  if (!brann) throw new Error('Missing Brann fixture');
  const renamed = {
    ...state,
    world: {
      ...state.world,
      entities: {
        ...state.world.entities,
        'char:brann': { ...brann, name: 'Brann, the barkeep' },
      },
    },
  };
  const model = renderModel(renamed, manifest, tavernMap);
  expect(model.sprites.find(({ id }) => id === 'char:brann')?.label).toBe(
    'Brann',
  );
});
