import type {
  BeatResult,
  EntityId,
  GameEvent,
  Graph,
  KnowledgeSlice,
  Node,
  ResolvedNarration,
  ServerMessage,
  WorldSnapshot,
} from '@dungeon/shared';
import { nodeSchema } from '@dungeon/shared';
import { witnessedRolls } from '../beat/drafts.js';
import { selectable } from '../beat/selection.js';

// All player-facing data, including provisional text, crosses this boundary.
export function playerPerspective(
  knowledge: KnowledgeSlice,
  graph: Graph,
  remembered: readonly EntityId[] = [],
) {
  const player = knowledge.character.id;
  const entities = selectable(knowledge);
  const visible = new Set(entities.map(({ id }) => id));
  const known = new Set(knowledge.facts.map(({ fact }) => fact.id));
  const permitted = new Set([
    ...visible,
    ...remembered,
    ...known,
    ...knowledge.quests.map(({ id }) => id),
    ...graph.nodes.filter((node) => 'tileBounds' in node).map(({ id }) => id),
  ]);
  const forbidden = graph.nodes.flatMap((node) => {
    if (permitted.has(node.id) || 'seq' in node) return [];
    return [node.id, ...('statement' in node ? [node.statement] : [])];
  });
  const safe = (value: unknown): boolean => {
    if (typeof value === 'string')
      return !forbidden.some((word) =>
        value.toLowerCase().includes(word.toLowerCase()),
      );
    if (Array.isArray(value)) return value.every((item: unknown) => safe(item));
    if (value && typeof value === 'object')
      return Object.entries(value).every(
        ([key, item]) => safe(key) && safe(item),
      );
    return true;
  };
  const text = (value: string) => (safe(value) ? value : '');
  function nodeView(node: Node): Node {
    const publicNode = nodeSchema.parse(
      Object.fromEntries(
        Object.entries(node).filter(
          ([key]) => key !== 'findDc' && key !== 'lockDc',
        ),
      ),
    );
    const common = {
      ...publicNode,
      name: text(node.name) || 'Unknown',
      summary: text(node.summary),
      tags: node.tags.filter(safe),
    };
    if ('role' in common && common.id !== player)
      return {
        ...common,
        summary: text(common.appearance),
        personality: '',
        background: '',
        appearance: text(common.appearance),
      };
    if ('properties' in common)
      return {
        ...common,
        properties: common.properties.filter(
          (value) => !value.startsWith('key_for:') && safe(value),
        ),
      };
    if ('statement' in common) return { ...common, truth: 'unknown' };
    return common;
  }
  function narration(value: ResolvedNarration): ResolvedNarration {
    return {
      text: text(value.text) || 'You notice no further change.',
      lines: value.lines.filter(
        (line) => permitted.has(line.speaker) && safe(line),
      ),
    };
  }
  function eventView(event: GameEvent): GameEvent | undefined {
    if (!event.witnesses.includes(player)) return;
    if (event.private && event.actor !== player) return;
    if (
      [
        'SeedLoaded',
        'BeatStarted',
        'BeatCommitted',
        'CriticRejected',
        'RecapUpdated',
        'AttitudeChanged',
      ].includes(event.type)
    )
      return;
    let value = {
      ...event,
      witnesses: event.witnesses.filter((id) => visible.has(id)),
    };
    if (value.type === 'IntentReceived' && value.actor !== player) {
      if (!value.payload.say) return;
      value = {
        ...value,
        payload: {
          text: value.payload.say,
          selection: [],
          say: value.payload.say,
        },
      };
    }
    if (value.type === 'NarrationCommitted')
      value = { ...value, payload: narration(value.payload) };
    if (value.type === 'EntityCreated') {
      if (!visible.has(value.payload.entity.id)) return;
      value = {
        ...value,
        payload: {
          ...value.payload,
          entity: nodeView(value.payload.entity),
          edges: [],
        },
      };
    }
    if (value.type === 'FactCreated') {
      if (!known.has(value.payload.fact.id)) return;
      value = {
        ...value,
        payload: {
          fact: { ...value.payload.fact, truth: 'unknown' },
          about: value.payload.about.filter((id) => permitted.has(id)),
          originOf: value.payload.originOf.filter((id) => permitted.has(id)),
        },
      };
    }
    if (value.type === 'FactLearned' && value.payload.characterId !== player)
      return;
    return safe(value) ? value : undefined;
  }
  return {
    snapshot(
      input: Omit<
        WorldSnapshot,
        'type' | 'entities' | 'party' | 'inventory' | 'gold'
      >,
    ): WorldSnapshot {
      return {
        ...input,
        type: 'world_snapshot',
        entities: entities.map(nodeView).filter(safe),
        positions: input.positions.filter(
          (position) => visible.has(position.entityId) && safe(position),
        ),
        party: graph.nodes.flatMap((node) =>
          'role' in node && node.role !== 'npc' && permitted.has(node.id)
            ? [node.id]
            : [],
        ),
        inventory: knowledge.inventory.map(({ id }) => id),
        gold: knowledge.character.gold,
        recentNarration: input.recentNarration.map(narration),
      };
    },
    result(result: BeatResult, dev: boolean): BeatResult {
      const events = result.events.flatMap((event) => eventView(event) ?? []);
      return {
        type: 'beat_result',
        beat: result.beat,
        events,
        narration: narration(result.narration),
        rolls: witnessedRolls(events),
        traceId: result.traceId,
        ...(dev ? { groundTruth: graph } : {}),
      };
    },
    message(message: ServerMessage): ServerMessage | undefined {
      if (message.type === 'beat_progress') {
        const progress = message.progress;
        if (progress.kind === 'peer_line' && !visible.has(progress.speaker))
          return;
        if (
          progress.kind === 'map_cue' &&
          (!visible.has(progress.entity) ||
            (progress.target && !visible.has(progress.target)))
        )
          return;
      }
      if (message.type === 'episode_ended') {
        if (!safe(message.holder)) return;
        return {
          ...message,
          summary: text(message.summary) || 'The chapter closes.',
        };
      }
      if (message.type === 'error')
        return {
          ...message,
          message:
            text(message.message) || 'The request could not be completed.',
        };
      return safe(message) ? message : undefined;
    },
  };
}
