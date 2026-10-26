import { itemIdSchema } from '@dungeon/shared';
import type { GameEvent, Provenance } from '@dungeon/shared';
import type { GraphMutation } from './mutations.js';
import { projectEventNode, projectObservation } from './eventProjection.js';
import {
  edgeMutation,
  holderMutation,
  props,
  removeHolder,
  locatedEdge,
} from './projectionHelpers.js';
import { projectCreatedEntity } from './creationProjection.js';
import { projectSeed } from './seedProjection.js';

export function project(record: GameEvent): GraphMutation[] {
  const provenance: Provenance = {
    createdBy: record.createdBy,
    createdAtBeat: record.beat,
  };
  const mutations = [
    ...projectEventNode(record, provenance),
    ...projectObservation(record, provenance),
  ];
  switch (record.type) {
    case 'SeedLoaded':
      return structuredClone(projectSeed(record.payload.seed));
    case 'EntityMoved': {
      const { entityId, to, tile } = record.payload;
      const itemId = itemIdSchema.safeParse(entityId);
      if (itemId.success) mutations.push(...removeHolder(itemId.data));
      else
        mutations.push(
          {
            type: 'removeEdges',
            filter: { types: ['LOCATED_IN'], from: entityId },
          },
          props(entityId, { tile }),
        );
      mutations.push({
        type: 'upsertEdge',
        edge: locatedEdge(entityId, to, provenance),
      });
      break;
    }
    case 'ItemTransferred':
      mutations.push(
        ...removeHolder(record.payload.itemId),
        holderMutation(record.payload.itemId, record.payload.to, provenance),
      );
      for (const change of record.payload.goldChanges)
        mutations.push(props(change.characterId, { gold: change.gold }));
      break;
    case 'ItemEquipped':
      mutations.push(
        {
          type: 'removeEdges',
          filter: {
            types: ['EQUIPPED'],
            from: record.payload.characterId,
            slot: record.payload.slot,
          },
        },
        edgeMutation(
          {
            type: 'EQUIPPED',
            from: record.payload.characterId,
            to: record.payload.itemId,
            properties: { slot: record.payload.slot },
          },
          provenance,
        ),
      );
      break;
    case 'ItemUnequipped':
      mutations.push({
        type: 'removeEdges',
        filter: {
          types: ['EQUIPPED'],
          from: record.payload.characterId,
          to: record.payload.itemId,
          slot: record.payload.slot,
        },
      });
      break;
    case 'ContainerOpened':
    case 'ContainerUnlocked':
      mutations.push(
        props(
          record.payload.containerId,
          record.type === 'ContainerOpened'
            ? { opened: true }
            : { locked: false },
        ),
      );
      for (const item of record.payload.revealed)
        mutations.push(props(item, { hidden: false }));
      break;
    case 'EntityRevealed':
    case 'EntityHidden':
      mutations.push(
        props(record.payload.entityId, {
          hidden: record.type === 'EntityHidden',
        }),
      );
      break;
    case 'DamageApplied':
    case 'Healed':
      mutations.push(
        props(record.payload.target, {
          hp: record.payload.hp,
          conscious: record.payload.conscious,
        }),
      );
      if (
        record.type === 'Healed' &&
        typeof record.payload.source === 'string' &&
        record.payload.source !== 'rest'
      )
        mutations.push({ type: 'removeNode', id: record.payload.source });
      break;
    case 'EntityCreated':
      mutations.push(...projectCreatedEntity(record.payload, provenance));
      break;
    case 'FactCreated': {
      const { fact, about, originOf, supersedes } = record.payload;
      mutations.push({ type: 'upsertNode', node: { ...fact, ...provenance } });
      for (const target of about)
        mutations.push(
          edgeMutation(
            { type: 'ABOUT', from: fact.id, to: target, properties: {} },
            provenance,
          ),
        );
      for (const target of originOf)
        mutations.push(
          edgeMutation(
            { type: 'ORIGIN_OF', from: fact.id, to: target, properties: {} },
            provenance,
          ),
        );
      if (supersedes)
        mutations.push(
          edgeMutation(
            {
              type: 'SUPERSEDES',
              from: fact.id,
              to: supersedes,
              properties: {},
            },
            provenance,
          ),
        );
      break;
    }
    case 'FactLearned': {
      const { characterId, factId, since, source, confidence } = record.payload;
      mutations.push(
        edgeMutation(
          {
            type: 'KNOWS',
            from: characterId,
            to: factId,
            properties: { since, source, confidence },
          },
          provenance,
        ),
        {
          type: 'retractSupersededKnows',
          learner: characterId,
          fact: factId,
          beat: record.beat,
        },
      );
      break;
    }
    case 'AttitudeChanged':
      mutations.push(
        edgeMutation(
          {
            type: 'ATTITUDE',
            from: record.payload.from,
            to: record.payload.to,
            properties: {
              value: record.payload.value,
              reason: record.payload.reason,
            },
          },
          provenance,
        ),
      );
      break;
    case 'QuestStatusChanged':
      mutations.push(
        props(record.payload.questId, { status: record.payload.status }),
      );
      break;
    case 'EpisodeEnded':
      mutations.push(props(record.payload.questId, { status: 'complete' }));
      break;
    case 'BeatStarted':
    case 'BeatCommitted':
    case 'CriticRejected':
    case 'TurnAdvanced':
    case 'RecapUpdated':
    case 'IntentReceived':
    case 'CheckRolled':
    case 'AttackResolved':
    case 'CombatStarted':
    case 'CombatEnded':
    case 'NarrationCommitted':
      break;
    default: {
      const exhaustive: never = record;
      return exhaustive;
    }
  }
  return structuredClone(mutations);
}
