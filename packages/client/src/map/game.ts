import Phaser from 'phaser';
import type { StoreApi } from 'zustand/vanilla';
import type { ClientStore } from '../store';
import { manifest, tavernMap } from './assets';
import { connectMap } from './bridge';
import { TILE_SIZE } from './mapData';
import { PAPER } from './palette';
import { TavernScene } from './TavernScene';

export function createMapGame(host: HTMLElement, store: StoreApi<ClientStore>) {
  const scene = new TavernScene();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const bridge = connectMap(store, scene, manifest, tavernMap, motion.matches);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: host.clientWidth || tavernMap.width * TILE_SIZE,
    height: host.clientHeight || tavernMap.height * TILE_SIZE,
    backgroundColor: PAPER,
    pixelArt: true,
    roundPixels: true,
    autoFocus: false,
    input: {
      keyboard: false,
      mouse: { preventDefaultWheel: false },
      touch: { capture: false },
    },
    audio: { noAudio: true },
    banner: false,
    scene: [scene],
    callbacks: {
      postBoot: (game) => {
        game.canvas.tabIndex = -1;
      },
    },
  });
  const resize = new ResizeObserver(() => {
    if (game.isBooted && host.clientWidth && host.clientHeight)
      game.scale.resize(host.clientWidth, host.clientHeight);
  });
  resize.observe(host);
  const motionChanged = () => bridge.setReducedMotion(motion.matches);
  motion.addEventListener('change', motionChanged);
  return {
    destroy: () => {
      resize.disconnect();
      motion.removeEventListener('change', motionChanged);
      bridge.destroy();
      game.destroy(true);
    },
  };
}
