import type Phaser from 'phaser';
import { SHEET_COLUMNS, SHEET_ROWS, TILE_SIZE } from './mapData';
import { recolourPixels } from './palette';

export const SHEET_KEY = 'tavern-ink';

export function registerSheet(scene: Phaser.Scene, source: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_COLUMNS * TILE_SIZE;
  canvas.height = SHEET_ROWS * TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map recolouring requires a 2D canvas.');
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(recolourPixels(pixels.data));
  context.putImageData(pixels, 0, 0);
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
