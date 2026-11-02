import { afterEach, expect, it, vi } from 'vitest';
import { recolouredSheet, sheetSnapshot, subscribeSheet } from './texture';

afterEach(() => vi.restoreAllMocks());
it('recolours once and publishes the same sheet for map remounts and portraits', () => {
  const canvas = document.createElement('canvas');
  const pixels = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255]);
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels })),
    putImageData: vi.fn(),
  };
  Object.defineProperty(canvas, 'getContext', { value: () => context });
  const toDataURL = vi
    .spyOn(canvas, 'toDataURL')
    .mockReturnValue('data:image/png;base64,c2hlZXQ=');
  const source = new Image();
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
    tag === 'canvas' ? canvas : create(tag, options),
  );
  const changed = vi.fn();
  const unsubscribe = subscribeSheet(changed);
  expect(sheetSnapshot()).toBeNull();
  expect(recolouredSheet(source)).toBe(canvas);
  expect(pixels).toEqual(
    new Uint8ClampedArray([43, 29, 18, 255, 155, 28, 28, 255]),
  );
  expect(sheetSnapshot()).toBe('data:image/png;base64,c2hlZXQ=');
  expect(changed).toHaveBeenCalledTimes(1);
  expect(recolouredSheet(new Image())).toBe(canvas);
  expect(context.getImageData).toHaveBeenCalledTimes(1);
  expect(toDataURL).toHaveBeenCalledTimes(1);
  unsubscribe();
});
