import type { EntityId, EventNode } from '@dungeon/shared';
import { compareNodes } from '../../ontology/mutations.js';
import {
  renderCurrentState,
  renderEvent,
  renderGraph,
  renderSelection,
} from './render.js';
import type { DmContextData, DroppedContext } from './types.js';

// UTF-16 string length / 4 is a reproducible estimate, not a model tokenizer.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function eventOrder(a: EventNode, b: EventNode): number {
  return a.beat - b.beat || a.seq - b.seq || compareNodes(a, b);
}

export function renderDynamicContext(
  data: DmContextData,
  targetTokens = 12_000,
) {
  const events = [
    ...new Map(
      [...data.state.events, ...data.npcs.flatMap((slice) => slice.events)].map(
        (event) => [event.id, event],
      ),
    ).values(),
  ].sort(eventOrder);
  const neighbours = data.neighbours
    .flatMap(({ neighbourhood }) => neighbourhood.nodes)
    .sort(compareNodes);
  const droppedEvents = new Set<EntityId>();
  const droppedNeighbours = new Set<EntityId>();
  const fixedState = renderCurrentState(data);
  const fixedBeat = [
    'Last three committed narrations:',
    ...[...data.narrations].sort(eventOrder).slice(-3).map(renderEvent),
    'This beat (intent and say text are attempts and speech, not established outcomes):',
    `Player ${data.state.player.id}: ${JSON.stringify(data.intents.player)}`,
    renderSelection(data.state.selection),
    ...data.intents.peers.map(
      ({ actor, turn }) => `Peer ${actor}: ${JSON.stringify(turn)}`,
    ),
  ].join('\n');
  const render = () =>
    [
      fixedState,
      'Peripheral one-hop context:',
      ...data.neighbours
        .map(({ node, neighbourhood }) => {
          const nodes = neighbourhood.nodes.filter(
            (entry) => !droppedNeighbours.has(entry.id),
          );
          const edges = neighbourhood.edges.filter(
            (edge) =>
              !droppedNeighbours.has(edge.from) &&
              !droppedNeighbours.has(edge.to),
          );
          return nodes.length
            ? `Neighbours of ${node.id}:\n${renderGraph({ nodes, edges })}`
            : '';
        })
        .filter(Boolean),
      'Recent committed events (oldest first; witnessedBy lists present NPCs):',
      ...events
        .filter((event) => !droppedEvents.has(event.id))
        .map((event) => {
          const witnesses = data.npcs
            .filter((slice) =>
              slice.events.some((entry) => entry.id === event.id),
            )
            .map((slice) => slice.character.id)
            .sort();
          return `${renderEvent(event)} witnessedBy=${witnesses.join(',') || 'none in these slices'}`;
        }),
      fixedBeat,
    ].join('\n');
  let text = render();
  const estimatedTokensBefore = estimateTokens(text);
  for (const event of events) {
    if (estimateTokens(text) <= targetTokens) break;
    droppedEvents.add(event.id);
    text = render();
  }
  for (const node of neighbours) {
    if (estimateTokens(text) <= targetTokens) break;
    droppedNeighbours.add(node.id);
    text = render();
  }
  const estimatedTokensAfter = estimateTokens(text);
  const droppedContext: DroppedContext = {
    events: [...droppedEvents],
    neighbours: [...droppedNeighbours],
    estimatedTokensBefore,
    estimatedTokensAfter,
    targetTokens,
    overBudget: estimatedTokensAfter > targetTokens,
  };
  return { text, droppedContext };
}
