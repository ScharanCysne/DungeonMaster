import type { EntityId, SpriteManifest } from '@dungeon/shared';
import type { StoreApi } from 'zustand/vanilla';
import type { ClientStore } from '../store';
import type { TavernMap } from './mapData';
import { renderModel } from './renderModel';
import type { RenderModel } from './renderModel';

export interface MapScenePort {
  setModel: (model: RenderModel) => void;
  on: (
    event: 'entity-clicked',
    listener: (event: { id: EntityId }) => void,
  ) => void;
  off: (
    event: 'entity-clicked',
    listener: (event: { id: EntityId }) => void,
  ) => void;
}

export function connectMap(
  store: StoreApi<ClientStore>,
  scene: MapScenePort,
  manifest: SpriteManifest,
  map: TavernMap,
  reducedMotion = false,
) {
  const push = () =>
    scene.setModel(renderModel(store.getState(), manifest, map, reducedMotion));
  const clicked = ({ id }: { id: EntityId }) => {
    const model = renderModel(store.getState(), manifest, map, reducedMotion);
    if (model.sprites.some((sprite) => sprite.id === id && !sprite.dmOnly))
      store.getState().dispatch({ type: 'selection_toggle', id });
  };
  scene.on('entity-clicked', clicked);
  push();
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.world !== previous.world ||
      state.selection !== previous.selection ||
      state.mapFeedback !== previous.mapFeedback ||
      state.mapCues !== previous.mapCues ||
      state.dev.dmView !== previous.dev.dmView ||
      state.dev.devTools !== previous.dev.devTools ||
      state.dev.groundTruth !== previous.dev.groundTruth
    )
      push();
  });
  return {
    setReducedMotion(value: boolean) {
      reducedMotion = value;
      push();
    },
    destroy() {
      unsubscribe();
      scene.off('entity-clicked', clicked);
    },
  };
}
