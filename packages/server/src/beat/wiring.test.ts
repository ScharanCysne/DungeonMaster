import { expect, it } from 'vitest';
import { z } from 'zod';
import { item } from '../agents/generators/testing.js';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { Session } from './Session.js';
import { verify } from '../ontology/verify.js';
import {
  accepted,
  calls,
  harness,
  pass,
  playerIntent,
  traceFile,
} from './testing/harness.js';

it('runs real generators and NPC voice through the DM registry and traces every role', async () => {
  const provider = new ScriptedProvider({
    peer: [pass, pass],
    generator: [{ type: 'structured', output: item }],
    npc_voice: [
      { type: 'structured', output: { text: 'Another round, friend?' } },
    ],
    dm: [
      calls(
        {
          name: 'generate_item',
          input: { brief: 'A small keepsake.', placement: 'char:kael' },
        },
        {
          name: 'voice_npc',
          input: { npc: 'char:tobb', direction: 'Greet the traveller.' },
        },
        {
          name: 'narrate',
          input: {
            text: 'You listen as a voice rises above the murmur.',
            lines: [{ lineId: 'voice-1-1' }],
          },
        },
      ),
    ],
    critic: [accepted],
  });
  const { session, store, dataDir, settings } = await harness({ provider });
  const result = await session.submitIntent(playerIntent());
  expect(result?.records.map(({ type }) => type)).toEqual([
    'BeatStarted',
    'IntentReceived',
    'EntityCreated',
    'FactCreated',
    'NarrationCommitted',
    'BeatCommitted',
  ]);
  expect(result?.result.narration.lines).toEqual([
    {
      speaker: 'char:tobb',
      text: 'Another round, friend?',
      lineId: 'voice-1-1',
    },
  ]);
  expect(session.engine.state.characters.get('char:kael')?.inventory).toContain(
    'item:copper-thimble',
  );
  expect(await verify(session.engine.state, store)).toEqual([]);
  const trace = z
    .object({ calls: z.array(z.object({ role: z.string() })) })
    .parse(await traceFile(dataDir));
  expect(trace.calls.map(({ role }) => role).sort()).toEqual([
    'critic',
    'dm',
    'generator',
    'npc_voice',
    'peer',
    'peer',
  ]);
  const rebuilt = new MemoryStore();
  const resumed = await Session.resume(session.id, {
    ...settings,
    store: rebuilt,
  });
  expect(resumed.engine.state.items).toEqual(session.engine.state.items);
  expect(resumed.engine.state.characters).toEqual(
    session.engine.state.characters,
  );
  expect(await rebuilt.nodes()).toEqual(await store.nodes());
  expect(await rebuilt.edges()).toEqual(await store.edges());
  provider.assertDrained();
});
