import { expect, it } from 'vitest';
import { z } from 'zod';
import { LlmRefusalError, LlmValidationError } from './errors.js';
import { ScriptedProvider } from './ScriptedProvider.js';
import { request } from './testing.js';

it('consumes independent role queues in order and records calls', async () => {
  const provider = new ScriptedProvider({
    peer: [
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ],
    dm: [
      {
        type: 'tool_use',
        content: [
          { type: 'tool_use', id: 'id', name: 'move', input: { to: 'door' } },
        ],
      },
    ],
  });
  await expect(provider.complete(request)).resolves.toMatchObject({
    content: [{ text: 'one' }],
  });
  await expect(
    provider.complete({ ...request, role: 'dm' }),
  ).resolves.toMatchObject({ stopReason: 'tool_use' });
  await expect(provider.complete(request)).resolves.toMatchObject({
    content: [{ text: 'two' }],
  });
  expect(provider.requests.map((call) => call.role)).toEqual([
    'peer',
    'dm',
    'peer',
  ]);
  provider.assertDrained();
  await expect(provider.complete(request)).rejects.toThrow(
    'Unexpected LLM call for peer',
  );
});
it('validates scripted structured output with the caller schema', async () => {
  const provider = new ScriptedProvider({
    generator: [
      { type: 'structured', output: { count: 1 } },
      { type: 'structured', output: { count: 'invalid' } },
    ],
  });
  const input = {
    ...request,
    role: 'generator' as const,
    outputFormat: z.strictObject({ count: z.number() }),
  };
  expect((await provider.complete(input)).parsedOutput?.count).toBe(1);
  await expect(provider.complete(input)).rejects.toBeInstanceOf(
    LlmValidationError,
  );
});
it('supports refusals, errors, enqueue and detection of unused script entries', async () => {
  const provider = new ScriptedProvider();
  const error = new Error('scripted failure');
  provider.enqueue('peer', { type: 'refusal' }, { type: 'error', error });
  expect(() => provider.assertDrained()).toThrow(
    'Unused scripted LLM calls for peer: 2',
  );
  await expect(provider.complete(request)).rejects.toBeInstanceOf(
    LlmRefusalError,
  );
  await expect(provider.complete(request)).rejects.toBe(error);
  provider.assertDrained();
});
