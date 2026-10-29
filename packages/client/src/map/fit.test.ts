import { expect, test } from 'vitest';
import { integerFit } from './fit';

test.each([
  [416, 256, 1, 0, 0],
  [832, 512, 2, 0, 0],
  [1000, 600, 2, 84, 44],
  [831, 512, 1, 207, 128],
  [1248, 767, 2, 208, 127],
  [1249, 769, 3, 0, 0],
  [200, 100, 1, 0, 0],
  [0, 0, 1, 0, 0],
])('integer fit for %s × %s', (width, height, scale, x, y) => {
  expect(integerFit(width, height, 416, 256)).toEqual({ scale, x, y });
});
