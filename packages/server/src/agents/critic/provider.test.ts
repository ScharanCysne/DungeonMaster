import { expect, it } from 'vitest';
import type { z } from 'zod';
import { peerTurnSchema } from '@dungeon/shared';
import { providerFor, request, wireMessage } from '../llm/testing.js';
import { npcLineSchema } from '../npc-voice/index.js';
import { criticOutputSchema } from './schema.js';

const cases: {
  role: 'peer' | 'npc_voice' | 'critic';
  schema: z.ZodType;
  output: unknown;
}[] = [
  {
    role: 'peer',
    schema: peerTurnSchema,
    output: { kind: 'intent', text: 'I wait.', refs: [], private: false },
  },
  {
    role: 'npc_voice',
    schema: npcLineSchema,
    output: { text: 'A quiet evening.' },
  },
  {
    role: 'critic',
    schema: criticOutputSchema,
    output: { claims: [], verdict: { ok: true }, selfLeaks: [] },
  },
];

it.each(cases)(
  'converts and parses the real $role schema through the SDK using a fake transport',
  async ({ role, schema, output }) => {
    const { provider, bodies, betaHeaders } = providerFor(
      wireMessage({
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(output) }],
      }),
    );
    expect(
      (await provider.complete({ ...request, role, outputFormat: schema }))
        .parsedOutput,
    ).toEqual(output);
    expect(bodies[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
    expect(betaHeaders[0]).toContain('server-side-fallback-2026-07-01');
  },
);
