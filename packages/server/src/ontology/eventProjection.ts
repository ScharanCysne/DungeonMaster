import type {
  EdgeOf,
  EntityId,
  EventId,
  GameEvent,
  Provenance,
  Roll,
} from '@dungeon/shared';
import type { GraphMutation } from './mutations.js';
import { edgeMutation, oneLine } from './projectionHelpers.js';

type Involvement = {
  id: EntityId;
  role: EdgeOf<'INVOLVES'>['properties']['role'];
};

export function projectEventNode(
  record: GameEvent,
  provenance: Provenance,
): GraphMutation[] {
  const id: EventId = `event:${record.beat}-${record.seq}`;
  let summary: string;
  let roll: Roll | undefined;
  const involved: Involvement[] = record.actor
    ? [{ id: record.actor, role: 'actor' }]
    : [];
  const targets = (ids: EntityId[]) =>
    involved.push(...ids.map((id): Involvement => ({ id, role: 'target' })));
  switch (record.type) {
    case 'IntentReceived':
      summary = `${record.actor ?? 'System'}: ${record.payload.text}${record.payload.say ? `; says ${record.payload.say}` : ''}`;
      for (const selected of record.payload.selection)
        involved.push({
          id: selected,
          role: selected.startsWith('item:')
            ? 'item'
            : selected.startsWith('loc:')
              ? 'location'
              : 'target',
        });
      break;
    case 'CheckRolled': {
      const check = record.payload;
      roll = check.kind === 'skill' ? check.roll : check.actorRoll;
      summary = `${check.actor} checked ${check.skill ?? ('ability' in check ? check.ability : '')}: ${roll.total} (${roll.outcome}); ${check.reason}`;
      if (check.kind === 'contested') {
        targets([check.target]);
        summary += `; ${check.target}: ${check.targetRoll.total}; winner ${check.winner ?? 'tie'}`;
      }
      break;
    }
    case 'AttackResolved':
      roll = record.payload.roll;
      summary = `${record.payload.attacker} attacked ${record.payload.target}: ${record.payload.hit ? 'hit' : 'miss'}${record.payload.critical ? ' (critical)' : ''}, roll ${roll.total}.`;
      targets([record.payload.target]);
      if (record.payload.weaponId)
        involved.push({ id: record.payload.weaponId, role: 'item' });
      break;
    case 'CombatStarted':
      summary = `Combat started; initiative: ${record.payload.order.join(', ')}.`;
      targets(record.payload.order);
      break;
    case 'CombatEnded':
      summary = `Combat ended: ${record.payload.reason}.`;
      break;
    case 'NarrationCommitted':
      summary = [
        record.payload.text,
        ...record.payload.lines.map((line) => `${line.speaker}: ${line.text}`),
      ].join(' ');
      targets(record.payload.lines.map((line) => line.speaker));
      break;
    case 'EpisodeEnded':
      summary = record.payload.summary;
      targets([record.payload.holder, record.payload.questId]);
      break;
    default:
      return [];
  }
  return [
    {
      type: 'upsertNode',
      node: {
        id,
        name: record.type,
        summary: oneLine(summary),
        tags: [],
        ...provenance,
        beat: record.beat,
        seq: record.seq,
        type: record.type,
        private: record.private,
        ...(roll ? { roll } : {}),
      },
    },
    ...record.witnesses.map((witness) =>
      edgeMutation(
        { type: 'WITNESSED', from: witness, to: id, properties: {} },
        provenance,
      ),
    ),
    ...involved.map((entity) =>
      edgeMutation(
        {
          type: 'INVOLVES',
          from: id,
          to: entity.id,
          properties: { role: entity.role },
        },
        provenance,
      ),
    ),
  ];
}

export function projectObservation(
  record: GameEvent,
  provenance: Provenance,
): GraphMutation[] {
  let statement: string;
  let about: EntityId[];
  if (record.type === 'ContainerOpened') {
    about = [record.payload.containerId, ...record.payload.revealed];
    statement = `${record.payload.containerId} was opened${record.payload.revealed.length ? `, revealing ${record.payload.revealed.join(', ')}` : ''}.`;
  } else if (record.type === 'EntityRevealed') {
    about = [record.payload.entityId];
    statement = `${record.payload.entityId} was revealed.`;
  } else return [];
  const id = `fact:observation-${record.beat}-${record.seq}` as const;
  return [
    {
      type: 'upsertNode',
      node: {
        id,
        name: `Observation ${record.beat}-${record.seq}`,
        summary: statement,
        statement,
        kind: 'observation',
        truth: true,
        tags: [],
        ...provenance,
      },
    },
    ...about.map((target) =>
      edgeMutation(
        { type: 'ABOUT', from: id, to: target, properties: {} },
        provenance,
      ),
    ),
    ...record.witnesses.map((witness) =>
      edgeMutation(
        {
          type: 'KNOWS',
          from: witness,
          to: id,
          properties: {
            source: 'witnessed',
            since: record.beat,
            confidence: 1,
          },
        },
        provenance,
      ),
    ),
  ];
}
