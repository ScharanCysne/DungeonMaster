import type {
  Edge,
  EpisodeSeed,
  EventNode,
  Graph,
  KnowledgeSlice,
  Node,
} from '@dungeon/shared';
import {
  compareEdges,
  compareNodes,
  compareStrings,
} from '../../ontology/mutations.js';
import { oneLine } from '../../ontology/projectionHelpers.js';
import type { SelectionContext } from '../../ontology/queries/selection.js';
import type { DmContextData } from './types.js';

export function renderNode(node: Node): string {
  const title = `${node.id} ${node.name}: ${oneLine(node.summary)}`;
  if ('role' in node)
    return `${title} ${JSON.stringify({ role: node.role, hp: `${node.hp}/${node.maxHp}`, ac: node.ac, conditions: [!node.conscious ? 'unconscious' : 'conscious', node.hidden ? 'hidden' : 'visible'], tags: node.tags, gold: node.gold, abilities: node.abilities, proficiencies: node.proficiencies })}`;
  if ('locked' in node)
    return `${title} ${JSON.stringify({ hidden: node.hidden, findDc: node.findDc, locked: node.locked, lockDc: node.lockDc, opened: node.opened, tile: node.tile })}`;
  if ('questCritical' in node)
    return `${title} ${JSON.stringify({ kind: node.kind, hidden: node.hidden, findDc: node.findDc, questCritical: node.questCritical, tags: node.tags, properties: node.properties, damage: node.damage, rarity: node.rarity, magical: node.magical, value: node.value })}`;
  if ('statement' in node)
    return `${node.id} [${node.kind}, truth=${node.truth}] ${oneLine(node.statement)}`;
  if ('objective' in node)
    return `${title} [${node.kind}, ${node.status}] ${oneLine(node.objective)}`;
  if ('tileBounds' in node)
    return `${title} [${node.kind}, lit=${node.lit}] bounds=${JSON.stringify(node.tileBounds)}`;
  if ('seq' in node) return renderEvent(node);
  return `${title} ideals=${JSON.stringify(node.ideals)} standing=${JSON.stringify(node.standing)}`;
}

export function renderEdge(edge: Edge): string {
  const properties = JSON.stringify(edge.properties);
  return `${edge.from} -${edge.type}-> ${edge.to}${properties === '{}' ? '' : ` ${properties}`}`;
}

export function renderGraph(graph: Graph): string {
  return [
    ...[...graph.nodes].sort(compareNodes).map(renderNode),
    ...[...graph.edges].sort(compareEdges).map(renderEdge),
  ].join('\n');
}

export function renderEpisode(seed: EpisodeSeed): string {
  const byId = (a: { id: string }, b: { id: string }) =>
    compareStrings(a.id, b.id);
  return [
    `Episode ${seed.episodeId}; map ${seed.mapId}. Initial premise and seed lore; current state supersedes initial conditions.`,
    ...seed.locations
      .filter((location) => location.kind === 'building')
      .sort(byId)
      .map((location) => `${location.name}: ${oneLine(location.summary)}`),
    ...[...seed.quests]
      .sort(byId)
      .map((quest) => `${quest.id}: ${quest.objective}`),
    ...[...seed.facts]
      .sort(byId)
      .map(
        (fact) =>
          `${fact.id} [${fact.kind}, truth=${fact.truth}] ${oneLine(fact.statement)} about=${[...fact.about].sort().join(',')}`,
      ),
  ].join('\n');
}

export function renderRecap(recap?: string): string | undefined {
  return recap?.trim()
    ? `Story so far (atmosphere only, not ground truth):\n${recap.trim()}`
    : undefined;
}

export function renderSelection(selection: SelectionContext): string {
  return selection
    .map(
      ({ node, neighbourhood }) =>
        `Selected: ${renderNode(node)}\n${renderGraph(neighbourhood)}`,
    )
    .join('\n');
}

export function renderKnowledge(slice: KnowledgeSlice): string {
  return [
    `${slice.character.id}: ${oneLine(slice.character.personality)} Background: ${oneLine(slice.character.background)}`,
    ...[...slice.facts]
      .sort((a, b) => compareNodes(a.fact, b.fact))
      .map(
        ({ fact, knowledge }) =>
          `${knowledge.properties.retractedAtBeat === undefined ? 'Knows' : 'Used to believe'}: ${renderNode(fact)} ${JSON.stringify(knowledge.properties)}`,
      ),
    `Secrets: ${
      slice.secrets
        .map((fact) => fact.id)
        .sort()
        .join(', ') || 'none'
    }`,
    `Sees: ${slice.visible
      .map((node) => node.id)
      .sort()
      .join(', ')}`,
    `Carries: ${
      slice.inventory
        .map((item) => item.id)
        .sort()
        .join(', ') || 'none'
    }`,
    ...[...slice.quests].sort(compareNodes).map(renderNode),
    ...[...slice.attitudes].sort(compareEdges).map(renderEdge),
  ].join('\n');
}

export function renderEvent(event: EventNode): string {
  return `${event.id} beat=${event.beat} seq=${event.seq} ${event.type} private=${event.private}: ${oneLine(event.summary)}`;
}

export function renderCurrentState(data: DmContextData): string {
  return [
    `Current state (DM ground truth; hidden is not player knowledge). Player ${data.state.player.id}; room ${data.state.room.id}.`,
    renderGraph(data.state.groundTruth),
    'Quests (questCritical item placement is given by the holder edges above):',
    ...[...data.state.quests].sort(compareNodes).map(renderNode),
    `Combat: ${data.combat ? JSON.stringify({ ...data.combat, activeActor: data.combat.order[data.combat.turn] }) : 'none'}`,
    'Present NPC knowledge (use only their knowledge when directing voice_npc):',
    ...[...data.npcs]
      .sort((a, b) => compareNodes(a.character, b.character))
      .map(renderKnowledge),
  ].join('\n');
}
