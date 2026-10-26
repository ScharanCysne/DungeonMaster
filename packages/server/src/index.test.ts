import { PROTOCOL_VERSION } from '@dungeon/shared';
import { expect, test } from 'vitest';
import { SERVER_PROTOCOL } from './index.js';

test('uses the shared workspace protocol version', () => {
  expect(SERVER_PROTOCOL).toBe(`dungeon/v${PROTOCOL_VERSION}`);
});
