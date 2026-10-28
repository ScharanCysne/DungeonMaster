import type {
  CharacterId,
  EntityId,
  Fact,
  ResolvedNarration,
} from '@dungeon/shared';
import { roomOf } from '../../engine/spatial.js';
import { knowledgeSlice } from '../../ontology/queries/knowledge.js';
import type { DmIntents, DmToolCall } from '../dm/types.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { playerId } from '../tools/validation.js';
import { mentionsName, referencedIds } from './mentions.js';
import type { PrecheckInput } from './precheck.js';

export async function criticContext(
  ctx: BeatContext,
  narration: ResolvedNarration,
  toolCalls: readonly DmToolCall[],
  intents: DmIntents,
) {
  ctx.collectEngineEvents();
  const view = await ctx.softState();
  const [nodes, edges, player] = await Promise.all([
    view.nodes(),
    view.edges(),
    knowledgeSlice(view, playerId(ctx)),
  ]);
  const speakingIds = new Set(narration.lines.map(({ speaker }) => speaker));
  const speaking = await Promise.all(
    nodes.flatMap((node) =>
      'role' in node && speakingIds.has(node.id)
        ? [knowledgeSlice(view, node.id)]
        : [],
    ),
  );
  const knownFacts = new Set(player.facts.map(({ fact }) => fact.id));
  const discovered = new Set<EntityId>([
    player.character.id,
    ...player.visible.map(({ id }) => id),
    ...player.inventory.map(({ id }) => id),
    ...edges
      .filter((edge) => edge.type === 'ABOUT' && knownFacts.has(edge.from))
      .map(({ to }) => to),
  ]);
  const state = ctx.engine.state;
  const playerCharacter = state.characters.get(player.character.id);
  const room = playerCharacter
    ? roomOf(state, playerCharacter.locationId)
    : undefined;
  const speakers = new Map<
    CharacterId,
    { present: boolean; conscious: boolean }
  >();
  for (const character of state.characters.values())
    speakers.set(character.id, {
      present:
        room !== undefined && roomOf(state, character.locationId) === room,
      conscious: character.conscious,
    });
  const text = [
    narration.text,
    ...narration.lines.map(({ text }) => text),
  ].join('\n');
  const ids = new Set<EntityId>([
    ...toolCalls.flatMap(({ input }) => referencedIds(input)),
    ...speakingIds,
  ]);
  for (const node of nodes)
    if (
      mentionsName(text, node.name) ||
      text.includes(node.id) ||
      ('role' in node &&
        node.name
          .split(/\s/u)
          .some(
            (word) =>
              word.length > 2 &&
              !['the', 'Sister', 'Old', 'Hooded'].includes(word) &&
              mentionsName(text, word.replace(/,$/u, '')),
          ))
    )
      ids.add(node.id);
  const mentioned = nodes.filter(({ id }) => ids.has(id));
  const relations = edges.filter(
    (edge) => ids.has(edge.from) || ids.has(edge.to),
  );
  const relatedFacts = new Set(
    relations.filter(({ type }) => type === 'ABOUT').map(({ from }) => from),
  );
  const facts = nodes.filter(
    (node): node is Fact =>
      'statement' in node &&
      (node.createdAtBeat === ctx.beat || relatedFacts.has(node.id)),
  );
  const deterministic: PrecheckInput = {
    narration,
    entities: nodes,
    discovered,
    speakers,
    voicedLines: ctx.voicedLines,
    events: ctx.events,
    receipts: ctx.engine.successfulReceipts(),
    beat: ctx.beat,
  };
  return {
    deterministic,
    edges,
    speaking,
    data: {
      narration,
      events: ctx.events,
      facts,
      groundTruth: { entities: mentioned, edges: relations },
      playerKnowledge: player,
      speakingKnowledge: speaking,
      storyFacts: ctx.storyFacts,
      intents,
    },
  };
}
