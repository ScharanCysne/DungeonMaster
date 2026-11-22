import { isDeepStrictEqual } from 'node:util';
import type { EntityId } from '@dungeon/shared';
import type { EngineState } from '../engine/state.js';
import type { OntologyStore } from './OntologyStore.js';
import { edgeKey } from './mutations.js';

export function verify(
  state: EngineState,
  store: OntologyStore,
): Promise<string[]> {
  return store.read(async (reader) => {
    const [nodes, edges] = await Promise.all([reader.nodes(), reader.edges()]);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const drift: string[] = [];
    const compare = (
      id: EntityId,
      field: string,
      engine: unknown,
      graph: unknown,
    ) => {
      if (!isDeepStrictEqual(engine, graph))
        drift.push(
          `${id} ${field}: engine=${JSON.stringify(engine) ?? 'missing'}, graph=${JSON.stringify(graph) ?? 'missing'}`,
        );
    };
    const properties = (id: EntityId, expected: Record<string, unknown>) => {
      const node = byId.get(id);
      const graph: Record<string, unknown> = node ? { ...node } : {};
      for (const [field, value] of Object.entries(expected))
        compare(id, field, value, graph[field]);
    };
    const located = (id: EntityId, expected: EntityId) =>
      compare(
        id,
        'LOCATED_IN',
        [expected],
        edges
          .filter((edge) => edge.type === 'LOCATED_IN' && edge.from === id)
          .map((edge) => edge.to)
          .sort(),
      );
    for (const character of state.characters.values()) {
      properties(character.id, {
        tile: character.tile,
        hp: character.hp,
        maxHp: character.maxHp,
        ac: character.ac,
        abilities: character.abilities,
        proficiencies: character.proficiencies,
        conscious: character.conscious,
        hidden: character.hidden,
        gold: character.gold,
      });
      located(character.id, character.locationId);
      compare(
        character.id,
        'CARRIES',
        [...character.inventory].sort(),
        edges
          .filter(
            (edge) => edge.type === 'CARRIES' && edge.from === character.id,
          )
          .map((edge) => edge.to)
          .sort(),
      );
      compare(
        character.id,
        'EQUIPPED',
        Object.entries(character.equipped)
          .map(([slot, id]) => `${slot}:${id}`)
          .sort(),
        edges
          .filter(
            (edge) => edge.type === 'EQUIPPED' && edge.from === character.id,
          )
          .map((edge) =>
            edge.type === 'EQUIPPED'
              ? `${edge.properties.slot}:${edge.to}`
              : '',
          )
          .sort(),
      );
    }
    for (const container of state.containers.values()) {
      properties(container.id, {
        tile: container.tile,
        locked: container.locked,
        opened: container.opened,
        hidden: container.hidden,
        lockDc: container.lockDc,
        findDc: container.findDc,
      });
      located(container.id, container.locationId);
      compare(
        container.id,
        'CONTAINS',
        [...container.contents].sort(),
        edges
          .filter(
            (edge) => edge.type === 'CONTAINS' && edge.from === container.id,
          )
          .map((edge) => edge.to)
          .sort(),
      );
    }
    for (const item of state.items.values()) {
      properties(item.id, {
        hidden: item.hidden,
        findDc: item.findDc,
        questCritical: item.questCritical,
      });
      const holders = edges
        .flatMap((edge) => {
          if (edge.type === 'LOCATED_IN' && edge.from === item.id)
            return [`location:${edge.to}`];
          if (edge.type === 'CARRIES' && edge.to === item.id)
            return [`character:${edge.from}`];
          if (edge.type === 'CONTAINS' && edge.to === item.id)
            return [`container:${edge.from}`];
          return [];
        })
        .sort();
      compare(
        item.id,
        'holder (CARRIES/CONTAINS/LOCATED_IN)',
        [`${item.holder.kind}:${item.holder.id}`],
        holders,
      );
    }
    for (const location of state.locations.values())
      properties(location.id, { lit: location.lit });
    const engineIds = new Set<EntityId>([
      ...state.characters.keys(),
      ...state.containers.keys(),
      ...state.items.keys(),
      ...state.locations.keys(),
    ]);
    for (const node of nodes)
      if (
        ('role' in node ||
          'locked' in node ||
          'questCritical' in node ||
          'tileBounds' in node) &&
        !engineIds.has(node.id)
      )
        compare(node.id, 'existence', 'absent', 'present');
    for (const edge of edges)
      if (
        ['LOCATED_IN', 'CARRIES', 'CONTAINS', 'EQUIPPED'].includes(edge.type) &&
        (!engineIds.has(edge.from) || !engineIds.has(edge.to))
      )
        drift.push(
          `${edge.from} ${edge.type}: engine=absent endpoint, graph=${edgeKey(edge)}`,
        );
    return drift;
  });
}
