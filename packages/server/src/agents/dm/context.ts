import type { CharacterId, EventNode } from '@dungeon/shared';
import { compareNodes } from '../../ontology/mutations.js';
import { dmContext } from '../../ontology/queries/dm.js';
import {
  knowledgeSlice,
  recentEvents,
} from '../../ontology/queries/knowledge.js';
import { selectionContext } from '../../ontology/queries/selection.js';
import { physical, spatialView } from '../../ontology/queries/spatial.js';
import type { BeatContext } from '../tools/BeatContext.js';
import type { DmContextData, DmIntents } from './types.js';

export async function loadDmContext(
  ctx: BeatContext,
  player: CharacterId,
  intents: DmIntents,
  recent = 20,
): Promise<DmContextData> {
  const state = await dmContext(
    ctx.store,
    player,
    intents.player.selection,
    recent,
  );
  const spatial = await ctx.store.read(spatialView);
  const present = state.groundTruth.nodes.filter(
    (node) =>
      'role' in node &&
      node.role === 'npc' &&
      spatial.room(node.id)?.id === state.room.id,
  );
  const npcs = await Promise.all(
    present.flatMap((node) =>
      'role' in node ? [knowledgeSlice(ctx.store, node.id, { recent })] : [],
    ),
  );
  const protectedIds = new Set([
    ...state.groundTruth.nodes.map((node) => node.id),
    ...state.quests.map((node) => node.id),
    ...state.selection.flatMap(({ node, neighbourhood }) => [
      node.id,
      ...neighbourhood.nodes.map((entry) => entry.id),
    ]),
    ...npcs.flatMap((slice) => slice.facts.map(({ fact }) => fact.id)),
  ]);
  const expanded = await selectionContext(
    ctx.store,
    state.groundTruth.nodes
      .filter(
        (node) => physical(node) && !intents.player.selection.includes(node.id),
      )
      .sort(compareNodes)
      .map((node) => node.id),
  );
  const neighbours = expanded.flatMap(({ node, neighbourhood }) => {
    const nodes = neighbourhood.nodes.filter(
      (entry) => !protectedIds.has(entry.id) && !('seq' in entry),
    );
    for (const entry of nodes) protectedIds.add(entry.id);
    const ids = new Set(nodes.map((entry) => entry.id));
    return nodes.length
      ? [
          {
            node,
            neighbourhood: {
              nodes,
              edges: neighbourhood.edges.filter(
                (edge) => ids.has(edge.from) || ids.has(edge.to),
              ),
            },
          },
        ]
      : [];
  });
  const narrations = recentEvents(
    spatial.nodes.filter(
      (node): node is EventNode =>
        'seq' in node && node.type === 'NarrationCommitted',
    ),
    { recent: 3 },
  );
  return {
    state,
    combat: ctx.engine.state.combat,
    npcs,
    neighbours,
    narrations,
    intents,
  };
}
