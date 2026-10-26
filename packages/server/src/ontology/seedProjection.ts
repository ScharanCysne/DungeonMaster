import type { EpisodeSeed, Provenance } from '@dungeon/shared';
import type { GraphMutation } from './mutations.js';
import { edgeMutation, holderMutation } from './projectionHelpers.js';

export function projectSeed(seed: EpisodeSeed): GraphMutation[] {
  const provenance: Provenance = { createdBy: 'seed', createdAtBeat: 0 };
  const mutations: GraphMutation[] = [];
  for (const { partOf, ...node } of seed.locations) {
    mutations.push({ type: 'upsertNode', node: { ...node, ...provenance } });
    if (partOf)
      mutations.push(
        edgeMutation(
          { type: 'PART_OF', from: node.id, to: partOf, properties: {} },
          provenance,
        ),
      );
  }
  for (const { location, ...node } of [
    ...seed.characters,
    ...seed.containers,
  ]) {
    mutations.push({ type: 'upsertNode', node: { ...node, ...provenance } });
    mutations.push(
      edgeMutation(
        { type: 'LOCATED_IN', from: node.id, to: location, properties: {} },
        provenance,
      ),
    );
  }
  for (const { holder, ...node } of seed.items) {
    mutations.push({ type: 'upsertNode', node: { ...node, ...provenance } });
    mutations.push(holderMutation(node.id, holder, provenance));
  }
  for (const { about, knownBy, ...fact } of seed.facts) {
    const node = {
      ...fact,
      name: fact.name ?? fact.id.slice(5),
      summary: fact.summary ?? fact.statement,
      ...provenance,
    };
    mutations.push({ type: 'upsertNode', node });
    for (const target of about)
      mutations.push(
        edgeMutation(
          { type: 'ABOUT', from: node.id, to: target, properties: {} },
          provenance,
        ),
      );
    for (const knowledge of knownBy)
      mutations.push(
        edgeMutation(
          {
            type: 'KNOWS',
            from: knowledge.character,
            to: node.id,
            properties: {
              since: 0,
              source: 'seed',
              confidence: knowledge.confidence,
            },
          },
          provenance,
        ),
      );
  }
  for (const quest of seed.quests) {
    if (quest.kind === 'personal') {
      const { pursuedBy, ...node } = quest;
      mutations.push({ type: 'upsertNode', node: { ...node, ...provenance } });
      mutations.push(
        edgeMutation(
          { type: 'PURSUES', from: pursuedBy, to: node.id, properties: {} },
          provenance,
        ),
      );
    } else
      mutations.push({ type: 'upsertNode', node: { ...quest, ...provenance } });
  }
  for (const { members, ...node } of seed.factions) {
    mutations.push({ type: 'upsertNode', node: { ...node, ...provenance } });
    for (const member of members)
      mutations.push(
        edgeMutation(
          {
            type: 'MEMBER_OF',
            from: member.character,
            to: node.id,
            properties: member.rank === undefined ? {} : { rank: member.rank },
          },
          provenance,
        ),
      );
  }
  for (const attitude of seed.attitudes)
    mutations.push(
      edgeMutation(
        {
          type: 'ATTITUDE',
          from: attitude.from,
          to: attitude.to,
          properties: { value: attitude.value, reason: attitude.reason },
        },
        provenance,
      ),
    );
  for (const secret of seed.secrets)
    mutations.push(
      edgeMutation(
        {
          type: 'HAS_SECRET',
          from: secret.character,
          to: secret.fact,
          properties: {},
        },
        provenance,
      ),
    );
  return mutations;
}
