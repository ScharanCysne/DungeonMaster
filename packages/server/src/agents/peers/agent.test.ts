import { beforeAll, expect, it } from 'vitest';
import type { KnowledgeSlice } from '@dungeon/shared';
import { loadEpisode } from '../../content/index.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { knowledgeSlice } from '../../ontology/queries/knowledge.js';
import { projectSeed } from '../../ontology/seedProjection.js';
import { LlmUnavailableError } from '../llm/errors.js';
import { ScriptedProvider } from '../llm/ScriptedProvider.js';
import type { ScriptedReply } from '../llm/ScriptedProvider.js';
import { response } from '../dm/testing.js';
import { buildPeerRequest, peerSayLines, runPeer } from './index.js';

let knowledge: KnowledgeSlice;
const player = { selection: [], text: 'I wait by the table.' };
beforeAll(async () => {
  const { seed } = await loadEpisode();
  const store = new MemoryStore();
  await store.apply(projectSeed(seed));
  knowledge = await knowledgeSlice(store, 'char:ilsa');
});

it('returns a validated turn and exposes public say even for a private action', async () => {
  const turn = {
    kind: 'intent',
    text: 'I look for the ledger.',
    refs: ['char:brann'],
    say: 'A moment, Brann.',
    private: true,
  };
  const provider = new ScriptedProvider({
    peer: [{ type: 'structured', output: turn }],
  });
  const result = await runPeer(provider, { knowledge, player });
  expect(result.turn).toEqual(turn);
  expect(result.trace.failed).toBe(false);
  expect(peerSayLines([result])).toEqual([
    { speaker: 'char:ilsa', text: 'A moment, Brann.' },
  ]);
  expect(provider.requests[0]).toMatchObject({
    role: 'peer',
    promptVersion: 'peer:v2',
    maxTokens: 1024,
    timeoutMs: 20_000,
  });
  expect(provider.requests[0]?.tools).toBeUndefined();
  provider.assertDrained();
});

const failures: ScriptedReply[] = [
  { type: 'structured', output: { kind: 'intent', text: 'I win.' } },
  { type: 'structured', output: { kind: 'pass', extra: true } },
  { type: 'refusal' },
  { type: 'text', text: 'I wait.' },
  { type: 'error', error: new Error('failed peer') },
  {
    type: 'response',
    response: response({
      stopReason: 'max_tokens',
      parsedOutput: { kind: 'pass' },
    }),
  },
];
it.each(failures)('passes and traces a failed call: $type', async (reply) => {
  const result = await runPeer(new ScriptedProvider({ peer: [reply] }), {
    knowledge,
    player,
  });
  expect(result.turn).toEqual({ kind: 'pass' });
  expect(result.trace.failed).toBe(true);
  expect(typeof result.trace.reason).toBe('string');
  expect(peerSayLines([result])).toEqual([]);
});

it('propagates provider unavailability', async () => {
  const error = new LlmUnavailableError('peer', 'model', 'offline');
  await expect(
    runPeer(new ScriptedProvider({ peer: [{ type: 'error', error }] }), {
      knowledge,
      player,
    }),
  ).rejects.toBe(error);
});

it('flags debug prompt leaks without adding the audit facts to the request', async () => {
  const known = knowledge.facts[0]?.fact;
  if (!known) throw new Error('Expected a known fact');
  const foreign = {
    ...known,
    id: 'fact:foreign' as const,
    statement: 'An unknown claim with "quoted words".',
  };
  const provider = new ScriptedProvider({
    peer: [{ type: 'structured', output: { kind: 'pass' } }],
  });
  const result = await runPeer(provider, {
    knowledge,
    player: { selection: [], text: foreign.statement },
    debugFacts: [foreign],
  });
  expect(result.trace.promptLeaks).toEqual(['fact:foreign']);
  expect(JSON.stringify(provider.requests)).not.toContain('fact:foreign');
});

it('includes persona, own goals/secrets, inventory, intent and the committed narration', async () => {
  const request = await buildPeerRequest({
    knowledge,
    player,
    lastNarration: { text: 'You sit.', lines: [] },
  });
  const text = JSON.stringify(request.messages);
  for (const value of [
    knowledge.character.personality,
    knowledge.character.background,
    'quest:ilsa-debt',
    'fact:ilsa-debt',
    'inventory',
    'attitudes',
    'You sit.',
    player.text,
  ])
    expect(text).toContain(value);
  expect(text).not.toContain('truth');
  expect(request.knowledgeSliceHash).toMatch(/^[0-9a-f]{64}$/u);
});

it.each([0, 1, 2, 3, 4])(
  'nudges only after three offered passes: %s',
  async (consecutivePasses) => {
    const request = await buildPeerRequest({
      knowledge,
      player,
      consecutivePasses,
    });
    expect(JSON.stringify(request.messages).includes('nudge')).toBe(
      consecutivePasses >= 3,
    );
  },
);
