import { expect, test } from 'vitest';
import { mapFit } from './fit';

test.each([
  [416, 256, 1, 0, 0],
  [832, 512, 2, 0, 0],
  [1000, 600, 2, 84, 44],
  [1248, 767, 2, 208, 127],
  [1249, 769, 3, 0, 0],
])(
  'uses a whole-number scale when at least 2× fits: %s × %s',
  (width, height, scale, x, y) => {
    expect(mapFit(width, height, 416, 256)).toEqual({ scale, x, y });
  },
);

test('fills a laptop-sized frame with a fractional scale below 2×', () => {
  const fit = mapFit(620, 377, 416, 256);
  expect(fit.scale).toBeCloseTo(377 / 256, 10);
  expect(fit.y).toBe(0);
  expect(fit.x).toBe(Math.floor((620 - 416 * (377 / 256)) / 2));
});

test('keeps the map at native size below 1× instead of shrinking it', () => {
  expect(mapFit(200, 100, 416, 256)).toEqual({ scale: 1, x: 0, y: 0 });
  expect(mapFit(0, 0, 416, 256)).toEqual({ scale: 1, x: 0, y: 0 });
});
