import { expect, test } from 'vitest';
import { beatTraceSchema } from '@dungeon/shared';
import { debugTrace } from '../testing/dev';
import { traceModel } from './traceModel';

test('marks the narrate that ended the loop as accepted, and unseen results as unknown', () => {
  const [first] = debugTrace.calls;
  if (!first) throw new Error('Missing trace call fixture');
  const trace = beatTraceSchema.parse({
    ...debugTrace,
    calls: [
      {
        ...first,
        response: {
          content: [
            { type: 'tool_use', id: 'n1', name: 'narrate', input: {} },
            { type: 'tool_use', id: 'm1', name: 'move', input: {} },
          ],
        },
      },
    ],
  });
  const tools = traceModel(trace).tools;
  expect(tools.find(({ name }) => name === 'narrate')?.ok).toBe(true);
  expect(tools.find(({ name }) => name === 'move')?.ok).toBeNull();
});
