import { PROTOCOL_VERSION } from '@dungeon/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from './App';

afterEach(cleanup);

test('renders Episode N with the shared protocol version', () => {
  render(<App />);

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Episode N',
  );
  expect(
    screen.getByText(`Protocol version: ${PROTOCOL_VERSION}`).textContent,
  ).toBe(`Protocol version: ${PROTOCOL_VERSION}`);
});
