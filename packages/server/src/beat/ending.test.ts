import { expect, test } from 'vitest';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import {
  accepted,
  calls,
  content,
  harness,
  narrate,
  pass,
  playerIntent,
} from './testing/harness.js';

test('chapter summary reuses the existing recap without an additional LLM call', async () => {
  const episode = structuredClone(content);
  const quill = episode.seed.items.find(({ id }) => id === 'item:quill');
  if (!quill) throw new Error('Missing quill');
  quill.hidden = false;
  quill.holder = { kind: 'location', id: 'loc:common-room' };
  const recap = 'The party spent ten beats searching the tavern.';
  const provider = new ScriptedProvider({
    peer: Array.from({ length: 22 }, () => pass),
    dm: [
      ...Array.from({ length: 10 }, () => calls(narrate)),
      calls(
        {
          name: 'transfer_item',
          input: {
            actor: 'char:kael',
            item: 'item:quill',
            to: 'char:kael',
            reason: 'pick_up',
          },
        },
        narrate,
      ),
    ],
    critic: Array.from({ length: 11 }, () => accepted),
    recap: [{ type: 'structured', output: { text: recap } }],
  });
  const { session } = await harness({ content: episode, provider });
  for (let beat = 0; beat < 10; beat++)
    await session.submitIntent(playerIntent());
  const result = await session.submitIntent(playerIntent());
  expect(result?.ended?.summary).toContain(recap);
  expect(
    session.records.findLast((record) => record.type === 'EpisodeEnded')
      ?.payload.summary,
  ).toBe(result?.ended?.summary);
  expect(provider.requests.filter(({ role }) => role === 'recap')).toHaveLength(
    1,
  );
  provider.assertDrained();
});
