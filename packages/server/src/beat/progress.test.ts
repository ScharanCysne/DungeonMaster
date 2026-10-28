import { expect, it } from 'vitest';
import type { ServerMessage } from '@dungeon/shared';
import { ScriptedProvider } from '../agents/llm/ScriptedProvider.js';
import type { LlmProvider, LlmRequest } from '../agents/llm/types.js';
import { reject } from '../agents/critic/testing.js';
import { beatProgress } from './progress.js';
import {
  accepted,
  calls,
  deferred,
  harness,
  narrate,
  pass,
  playerIntent,
} from './testing/harness.js';

function statuses(messages: ServerMessage[]) {
  return messages.flatMap((message) =>
    message.type === 'beat_progress' && message.progress.kind === 'status'
      ? [message.progress]
      : [],
  );
}

it('reports the NPC phase before its provider call and resumes DM counts afterward', async () => {
  const messages: ServerMessage[] = [];
  const gate = deferred<void>();
  const entered = deferred<void>();
  const script = new ScriptedProvider({
    peer: [pass, pass],
    dm: [
      calls({
        name: 'voice_npc',
        input: { npc: 'char:brann', direction: 'Greet the player.' },
      }),
      calls(narrate),
    ],
    npc_voice: [{ type: 'structured', output: { text: 'Welcome.' } }],
    critic: [accepted],
  });
  const provider: LlmProvider = {
    async complete<T>(request: LlmRequest<T>) {
      if (request.role === 'npc_voice') {
        entered.resolve();
        await gate.promise;
      }
      return script.complete(request);
    },
  };
  const { session } = await harness({
    provider,
    onMessage: (message) => {
      messages.push(message);
    },
  });
  const pending = session.submitIntent(playerIntent());
  await entered.promise;
  expect(statuses(messages).at(-1)).toEqual({
    kind: 'status',
    phase: 'npc_voice',
  });
  expect(messages.some(({ type }) => type === 'beat_result')).toBe(false);
  expect(session.records).toHaveLength(2);
  gate.resolve();
  await pending;
  expect(statuses(messages)).toEqual([
    { kind: 'status', phase: 'peers' },
    { kind: 'status', phase: 'dm' },
    { kind: 'status', phase: 'npc_voice' },
    { kind: 'status', phase: 'dm', toolCalls: 1 },
    { kind: 'status', phase: 'dm', toolCalls: 2 },
    { kind: 'status', phase: 'critic', toolCalls: 2 },
    { kind: 'status', phase: 'committing', toolCalls: 2 },
  ]);
  script.assertDrained();
});

it('reports a critic-triggered DM retry with a cumulative count and a second review', async () => {
  const messages: ServerMessage[] = [];
  const provider = new ScriptedProvider({
    peer: [pass, pass],
    dm: [calls(narrate), calls(narrate)],
    critic: [reject, accepted],
  });
  const { session } = await harness({
    provider,
    onMessage: (message) => {
      messages.push(message);
    },
  });
  const result = await session.submitIntent(playerIntent());
  expect(result?.result.type).toBe('beat_result');
  expect(statuses(messages)).toEqual([
    { kind: 'status', phase: 'peers' },
    { kind: 'status', phase: 'dm' },
    { kind: 'status', phase: 'dm', toolCalls: 1 },
    { kind: 'status', phase: 'critic', toolCalls: 1 },
    { kind: 'status', phase: 'dm_retry', toolCalls: 1 },
    { kind: 'status', phase: 'dm_retry', toolCalls: 2 },
    { kind: 'status', phase: 'critic', toolCalls: 2 },
    { kind: 'status', phase: 'committing', toolCalls: 2 },
  ]);
  provider.assertDrained();
});

it('commits even if every status observer throws', async () => {
  const { session } = await harness({
    onMessage(message) {
      if (message.type === 'beat_progress')
        throw new Error('Display disconnected.');
    },
  });
  expect((await session.submitIntent(playerIntent()))?.result.type).toBe(
    'beat_result',
  );
  expect(session.state.status).toBe('running');
});

it('ignores late work after stopping an attempt', () => {
  const messages: ServerMessage[] = [];
  const progress = beatProgress(1, (message) => {
    messages.push(message);
  });
  progress.status('dm_retry');
  progress.status('npc_voice');
  progress.toolCall(4);
  expect(statuses(messages).at(-1)).toEqual({
    kind: 'status',
    phase: 'dm_retry',
    toolCalls: 4,
  });
  progress.stop();
  progress.status('critic');
  progress.toolCall(5);
  expect(messages).toHaveLength(3);
});
