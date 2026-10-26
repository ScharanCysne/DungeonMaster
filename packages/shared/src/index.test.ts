import { expect, test } from 'vitest';
import { PROTOCOL_VERSION } from './index.js';

test('starts with protocol version 1', () => {
  expect(PROTOCOL_VERSION).toBe(1);
});
