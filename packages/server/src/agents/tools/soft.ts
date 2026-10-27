import { uniqueId } from '@dungeon/shared';
import type {
  CreateFactInput,
  SetAttitudeInput,
  SetQuestStatusInput,
  ShareFactInput,
} from '@dungeon/shared';
import type { LogDraft } from '../../ontology/eventLog.js';
import type { BeatContext } from './BeatContext.js';
import { success } from './types.js';
import {
  playerId,
  requireCharacter,
  requireNode,
  requirePresent,
  requireTool,
} from './validation.js';

export async function setAttitude(input: SetAttitudeInput, ctx: BeatContext) {
  const view = await ctx.softState();
  await requireCharacter(view, input.from);
  await requireCharacter(view, input.to);
  requireTool(
    Math.abs(input.delta) <= ctx.limits.attitudeDelta,
    'ATTITUDE_DELTA_LIMIT',
    `delta ${input.delta}: expected -${ctx.limits.attitudeDelta}..${ctx.limits.attitudeDelta}.`,
  );
  const prior = (
    await view.edges({ types: ['ATTITUDE'], from: input.from, to: input.to })
  )[0];
  const previous = prior?.type === 'ATTITUDE' ? prior.properties.value : 0;
  const value = {
    ...input,
    value: Math.max(-100, Math.min(100, previous + input.delta)),
  };
  return success(
    value,
    [
      {
        type: 'AttitudeChanged',
        payload: value,
        actor: input.from,
        private: true,
        witnesses: [input.from],
        createdBy: 'engine',
      },
    ],
    [
      `${input.from}'s attitude toward ${input.to} is now ${value.value}: ${input.reason}`,
    ],
  );
}

export async function shareFact(input: ShareFactInput, ctx: BeatContext) {
  const view = await ctx.softState();
  const fact = await requireNode(view, input.factId);
  requireTool(
    'statement' in fact,
    'NOT_A_FACT',
    `${input.factId}: expected a fact.`,
  );
  if (input.from) {
    await requireCharacter(view, input.from);
    const knows = await view.edges({
      types: ['KNOWS'],
      from: input.from,
      to: input.factId,
    });
    requireTool(
      knows.some(
        (edge) =>
          edge.type === 'KNOWS' &&
          edge.properties.retractedAtBeat === undefined,
      ),
      'FACT_NOT_KNOWN',
      `${input.from}: expected current knowledge of ${input.factId}.`,
    );
  }
  const recipients = [...new Set(input.to)];
  const anchor = input.from ?? playerId(ctx);
  for (const recipient of recipients) {
    await requireCharacter(view, recipient);
    requirePresent(ctx, recipient, anchor);
  }
  const witnesses = [
    ...new Set([...recipients, ...(input.from ? [input.from] : [])]),
  ];
  const learned = recipients.map((characterId) => ({
    characterId,
    factId: input.factId,
    since: ctx.beat,
    source: input.source,
    confidence: 1,
  }));
  return success(
    { learned },
    learned.map((payload): LogDraft => ({
      type: 'FactLearned',
      payload,
      actor: input.from ?? null,
      private: true,
      witnesses,
      createdBy: 'engine',
    })),
    recipients.map((id) => `${id} learned ${input.factId}: ${fact.statement}`),
  );
}

export async function createFact(input: CreateFactInput, ctx: BeatContext) {
  const view = await ctx.softState();
  for (const id of input.about) {
    const node = await requireNode(view, id);
    requireTool(
      !('questCritical' in node && node.questCritical),
      'QUEST_FACT_PROTECTED',
      `${id}: facts about questCritical items may only come from the seed.`,
    );
  }
  const knownBy = [...new Set(input.knownBy)];
  for (const id of knownBy) await requireCharacter(view, id);
  if (input.supersedes) {
    const fact = await requireNode(view, input.supersedes);
    requireTool(
      'statement' in fact,
      'NOT_A_FACT',
      `${input.supersedes}: expected an existing fact.`,
    );
  }
  const factId = uniqueId(
    'fact',
    input.statement,
    (await view.nodes()).map((node) => node.id),
  );
  const fact = {
    id: factId,
    name: input.statement,
    summary: input.statement,
    tags: [],
    statement: input.statement,
    truth: input.truth,
    kind: input.kind,
    createdBy: 'dm' as const,
    createdAtBeat: ctx.beat,
  };
  const events: LogDraft[] = [
    {
      type: 'FactCreated',
      payload: {
        fact,
        about: [...new Set(input.about)],
        originOf: [],
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
      },
      actor: null,
      private: true,
      witnesses: knownBy,
      createdBy: 'dm',
    },
  ];
  for (const characterId of knownBy)
    events.push({
      type: 'FactLearned',
      payload: {
        characterId,
        factId,
        since: ctx.beat,
        source: 'witnessed',
        confidence: 1,
      },
      actor: null,
      private: true,
      witnesses: knownBy,
      createdBy: 'dm',
    });
  return success({ factId }, events, [`Created ${factId}: ${input.statement}`]);
}

export async function setQuestStatus(
  input: SetQuestStatusInput,
  ctx: BeatContext,
) {
  const view = await ctx.softState();
  const quest = await requireNode(view, input.quest);
  requireTool(
    'objective' in quest,
    'NOT_A_QUEST',
    `${input.quest}: expected a quest.`,
  );
  requireTool(
    quest.kind === 'personal',
    'QUEST_PROTECTED',
    `${input.quest}: only the engine may close the episode quest.`,
  );
  const pursuers = await view.edges({ types: ['PURSUES'], to: input.quest });
  const pursuer = pursuers[0];
  requireTool(
    pursuers.length === 1 && pursuer?.type === 'PURSUES',
    'QUEST_PURSUER_MISSING',
    `${input.quest}: expected exactly one personal quest pursuer.`,
  );
  await requireCharacter(view, pursuer.from);
  const value = { questId: input.quest, status: input.status };
  return success(
    value,
    [
      {
        type: 'QuestStatusChanged',
        payload: value,
        actor: pursuer.from,
        private: true,
        witnesses: [pursuer.from],
        createdBy: 'engine',
      },
    ],
    [`${input.quest} is now ${input.status}.`],
  );
}
