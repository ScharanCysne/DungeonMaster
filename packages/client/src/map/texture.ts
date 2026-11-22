import type Phaser from 'phaser';
import { SHEET_COLUMNS, SHEET_ROWS, TILE_SIZE } from './mapData';
import { recolourPixels } from './palette';

export const SHEET_KEY = 'tavern-ink';

let sheet: HTMLCanvasElement | null = null;
let sheetUrl: string | null = null;
const listeners = new Set<() => void>();
export const sheetSnapshot = () => sheetUrl;
export function subscribeSheet(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recolouredSheet(source: HTMLImageElement) {
  if (sheet) return sheet;
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_COLUMNS * TILE_SIZE;
  canvas.height = SHEET_ROWS * TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map recolouring requires a 2D canvas.');
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(recolourPixels(pixels.data));
  context.putImageData(pixels, 0, 0);
  sheet = canvas;
  sheetUrl = canvas.toDataURL();
  for (const listener of listeners) listener();
  return canvas;
}

export function registerSheet(scene: Phaser.Scene, source: HTMLImageElement) {
  const shared = recolouredSheet(source);
  // Phaser owns and destroys its canvas; retain the shared sheet across map remounts.
  const canvas = document.createElement('canvas');
  canvas.width = shared.width;
  canvas.height = shared.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map texture requires a 2D canvas.');
  context.drawImage(shared, 0, 0);
  const texture = scene.textures.addCanvas(SHEET_KEY, canvas);
  if (!texture) throw new Error('Could not register the map texture.');
  for (let frame = 0; frame < SHEET_COLUMNS * SHEET_ROWS; frame++)
    texture.add(
      frame,
      0,
      (frame % SHEET_COLUMNS) * TILE_SIZE,
      Math.floor(frame / SHEET_COLUMNS) * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
    );
  return texture;
}
