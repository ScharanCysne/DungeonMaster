import { expect, it } from 'vitest';
import type { CriticIssueType } from '@dungeon/shared';
import { LlmUnavailableError } from '../llm/errors.js';
import { checkNarration } from './check.js';
import { criticContext } from './context.js';
import { issue, proposal, setup, verdict } from './testing.js';

it('passes unspent receipt hints to the LLM without forcing rejection', async () => {
  const f = await setup();
  f.engine.skill_check({
    actor: 'char:kael',
    skill: 'perception',
    dc: 5,
    advantage: 'none',
    reason: 'Look around.',
  });
  const receipts = f.engine.successfulReceipts();
  expect(receipts).toHaveLength(1);
  f.provider.enqueue('critic', verdict());
  const check = await checkNarration(
    f.options,
    f.ctx,
    proposal,
    [],
    f.options.intents,
  );
  expect(check.verdict).toEqual({ ok: true });
  expect(check.precheck.unspentReceipts).toEqual(receipts);
  const text = f.provider.requests.at(-1)?.messages[0]?.content;
  expect(text).toEqual(expect.stringContaining('unspentReceiptHints'));
  expect(text).toEqual(expect.stringContaining(receipts[0]?.id ?? 'missing'));
});

it('lets the LLM reject an unsupported outcome despite a successful receipt', async () => {
  const f = await setup();
  f.provider.enqueue(
    'critic',
    verdict({
      verdict: { ok: false, issues: [{ ...issue, type: 'unbacked_outcome' }] },
    }),
  );
  expect(
    (await checkNarration(f.options, f.ctx, proposal, [], f.options.intents))
      .verdict,
  ).toMatchObject({ ok: false, issues: [{ type: 'unbacked_outcome' }] });
});

it('does not allow the LLM to override deterministic errors', async () => {
  const f = await setup();
  f.provider.enqueue('critic', verdict());
  const result = await checkNarration(
    f.options,
    f.ctx,
    { text: 'You succeed.', lines: [] },
    [],
    f.options.intents,
  );
  expect(result.verdict).toMatchObject({
    ok: false,
    issues: [{ type: 'unbacked_outcome' }],
  });
});

const issueTypes: CriticIssueType[] = [
  'state_contradiction',
  'unbacked_outcome',
  'invented_content',
  'perspective_leak',
  'npc_knowledge_leak',
  'lore_contradiction',
  'temporal_contradiction',
];
it.each(issueTypes)(
  'parses the shared verdict issue type %s and claim evidence',
  async (type) => {
    const f = await setup();
    const claims = [{ quote: 'You pause.', evidence: 'No movement event.' }];
    f.provider.enqueue(
      'critic',
      verdict({ claims, verdict: { ok: false, issues: [{ ...issue, type }] } }),
    );
    const result = await checkNarration(
      f.options,
      f.ctx,
      proposal,
      [],
      f.options.intents,
    );
    expect(result.verdict).toEqual({ ok: false, issues: [{ ...issue, type }] });
    expect(result.output?.claims).toEqual(claims);
  },
);

it.each([
  { claims: [], verdict: { ok: false, issues: [] }, selfLeaks: [] },
  {
    claims: [],
    verdict: { ok: false, issues: [{ ...issue, type: 'style' }] },
    selfLeaks: [],
  },
  { ok: true },
  null,
])('fails closed on invalid critic output: %j', async (output) => {
  const f = await setup();
  f.provider.enqueue('critic', { type: 'structured', output });
  const check = await checkNarration(
    f.options,
    f.ctx,
    proposal,
    [],
    f.options.intents,
  );
  expect(check.verdict).toBeNull();
  expect(check.failure).toEqual(expect.any(String));
});

it('handles refusal and propagates unavailability', async () => {
  const f = await setup();
  const error = new LlmUnavailableError('critic', 'model', 'offline');
  f.provider.enqueue('critic', { type: 'refusal' }, { type: 'error', error });
  expect(
    (await checkNarration(f.options, f.ctx, proposal, [], f.options.intents))
      .verdict,
  ).toBeNull();
  await expect(
    checkNarration(f.options, f.ctx, proposal, [], f.options.intents),
  ).rejects.toBe(error);
});

it('gathers tool-input IDs, name matches, speaker slices and story evidence from pending state', async () => {
  const f = await setup();
  const facts = f.seed.facts;
  const base = await f.store.getNode(facts[0]?.id ?? 'fact:missing');
  if (!base || !('statement' in base)) throw new Error('Expected seed fact');
  f.ctx.storyFacts.push({
    facts: [{ ...base, id: 'fact:new-story' }],
    basedOn: [base],
  });
  const data = await criticContext(
    f.ctx,
    {
      text: 'Brann watches the Hooded stranger.',
      lines: [
        { speaker: 'char:ilsa', text: 'I wait.' },
        { speaker: 'char:tobb', text: 'Yes.' },
      ],
    },
    [
      {
        name: 'search',
        input: {
          actor: 'char:kael',
          nested: { targets: ['container:floorboard'] },
        },
        ok: true,
      },
    ],
    f.options.intents,
  );
  expect(data.data.groundTruth.entities.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      'char:brann',
      'char:stranger',
      'container:floorboard',
    ]),
  );
  expect(
    data.data.speakingKnowledge.map(({ character }) => character.id).sort(),
  ).toEqual(['char:ilsa', 'char:tobb']);
  expect(data.data.playerKnowledge.character.id).toBe('char:kael');
  expect(data.data.storyFacts).toEqual(f.ctx.storyFacts);
  expect(data.data.storyFacts[0]?.basedOn).toEqual([base]);
});
