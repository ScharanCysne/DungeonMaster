import { createHash } from 'node:crypto';
import type { Fact, KnowledgeSlice } from '@dungeon/shared';
import type { LlmRequest } from './llm/types.js';

export function requestText(request: LlmRequest): string {
  return [
    ...request.system.map(({ text }) => text),
    ...request.messages.map(({ content }) =>
      typeof content === 'string' ? content : JSON.stringify(content),
    ),
  ].join('\n');
}

export function characterContext(slice: KnowledgeSlice) {
  const own = slice.character;
  return {
    persona: {
      id: own.id,
      name: own.name,
      personality: own.personality,
      background: own.background,
      // Episode N stores speech habits in personality, without a separate voice field.
      voice: own.personality,
    },
    sheet: {
      abilities: own.abilities,
      proficiencies: own.proficiencies,
      hp: own.hp,
      maxHp: own.maxHp,
      gold: own.gold,
    },
    facts: slice.facts.map(({ fact, knowledge }) => ({
      id: fact.id,
      statement: fact.statement,
      ...knowledge.properties,
      belief:
        knowledge.properties.retractedAtBeat === undefined
          ? 'knows'
          : 'used to believe',
    })),
    secrets: slice.secrets.map(({ id }) => id),
    goals: slice.quests,
    attitudes: slice.attitudes,
    inventory: slice.inventory.map(({ id, name, properties }) => ({
      id,
      name,
      properties,
    })),
    // Other characters' summaries and sheets can contain their private affiliations.
    visible: slice.visible.map((node) => ({
      id: node.id,
      name: node.name,
      ...('appearance' in node ? { appearance: node.appearance } : {}),
    })),
    witnessed: slice.events,
  };
}

export function knowledgeHash(slice: KnowledgeSlice): string {
  return createHash('sha256')
    .update(JSON.stringify(characterContext(slice)))
    .digest('hex');
}

export function unknownFactMentions(
  text: string,
  slice: KnowledgeSlice,
  facts: readonly Fact[],
) {
  const known = new Set(slice.facts.map(({ fact }) => fact.id));
  return facts
    .filter(
      (fact) =>
        !known.has(fact.id) &&
        (text.includes(fact.id) ||
          (fact.statement.length > 0 &&
            (text.includes(fact.statement) ||
              text.includes(JSON.stringify(fact.statement).slice(1, -1))))),
    )
    .map(({ id }) => id);
}
