import { expect, test } from 'vitest';
import { recolourPixels } from './palette';

test('warm pixels become red ink, other opaque pixels become ink', () => {
  const source = new Uint8ClampedArray([255, 80, 30, 255, 30, 180, 90, 255]);
  expect([...recolourPixels(source)]).toEqual([
    155, 28, 28, 255, 43, 29, 18, 255,
  ]);
  expect([...source]).toEqual([255, 80, 30, 255, 30, 180, 90, 255]);
});
test('uses strict red dominance over both channels and the exact alpha threshold', () => {
  const source = new Uint8ClampedArray([
    100, 60, 0, 255, 100, 0, 60, 255, 100, 59, 59, 128, 255, 0, 0, 127, 0, 255,
    0, 0,
  ]);
  expect([...recolourPixels(source)]).toEqual([
    43, 29, 18, 255, 43, 29, 18, 255, 155, 28, 28, 128, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
});
