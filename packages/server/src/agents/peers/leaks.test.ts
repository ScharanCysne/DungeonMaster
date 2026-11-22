import { beforeAll, expect, it } from 'vitest';
import type { CharacterId, Fact } from '@dungeon/shared';
import { loadEpisode } from '../../content/index.js';
import { MemoryStore } from '../../ontology/MemoryStore.js';
import { knowledgeSlice } from '../../ontology/queries/knowledge.js';
import { projectSeed } from '../../ontology/seedProjection.js';
import { requestText, unknownFactMentions } from '../characterContext.js';
import { buildNpcVoiceRequest } from '../npc-voice/index.js';
import { buildPeerRequest } from './request.js';

const store = new MemoryStore();
let facts: Fact[];
beforeAll(async () => {
  const { seed } = await loadEpisode();
  await store.apply(projectSeed(seed));
  facts = (await store.nodes()).filter(
    (node): node is Fact => 'statement' in node,
  );
});
const peers: CharacterId[] = ['char:ilsa', 'char:doran', 'char:mael'];
const npcs: CharacterId[] = [
  'char:brann',
  'char:tobb',
  'char:wren',
  'char:stranger',
  'char:marta',
];

it('covers every peer and NPC in the actual seed', async () => {
  const { seed } = await loadEpisode();
  expect(
    seed.characters
      .filter(({ role }) => role !== 'player')
      .map(({ id }) => id)
      .sort(),
  ).toEqual([...peers, ...npcs].sort());
});

it.each(peers)(
  'peer %s receives no unknown fact ID or statement in its rendered request',
  async (id) => {
    const knowledge = await knowledgeSlice(store, id);
    const request = await buildPeerRequest({
      knowledge,
      player: { selection: ['char:brann'], text: 'I ask Brann about Odo.' },
      lastNarration: { text: 'You enter the common room.', lines: [] },
    });
    expect(unknownFactMentions(requestText(request), knowledge, facts)).toEqual(
      [],
    );
    expect(JSON.stringify(request)).not.toContain(
      'An Ashen Hand agent waiting',
    );
    expect(JSON.stringify(request)).not.toContain('Sent by the Ashen Hand');
  },
);

it.each(npcs)(
  'NPC %s receives only its persona/knowledge and the DM direction',
  async (id) => {
    const knowledge = await knowledgeSlice(store, id);
    const direction = 'Answer cautiously, with a tired tone.';
    const request = await buildNpcVoiceRequest({ knowledge, direction });
    expect(unknownFactMentions(requestText(request), knowledge, facts)).toEqual(
      [],
    );
    const message = request.messages[0]?.content;
    if (typeof message !== 'string')
      throw new Error('Expected a rendered request');
    const parsed: unknown = JSON.parse(message);
    if (!parsed || typeof parsed !== 'object' || !('direction' in parsed))
      throw new Error('Expected voice context');
    expect(parsed.direction).toBe(direction);
    expect(Object.keys(parsed ?? {})).toEqual(['character', 'direction']);
    expect(request.system).toHaveLength(1);
    expect(request.system[0]?.text).not.toContain(direction);
    expect(JSON.stringify(request)).not.toContain('lastCommittedNarration');
    expect(JSON.stringify(request)).not.toContain('playerIntent');
  },
);

it('the leak scanner detects both a foreign fact ID and its statement', async () => {
  const knowledge = await knowledgeSlice(store, 'char:ilsa');
  const fact = facts.find(({ id }) => id === 'fact:mael-orders');
  if (!fact) throw new Error('Missing seed secret');
  expect(unknownFactMentions(fact.id, knowledge, facts)).toEqual([fact.id]);
  expect(unknownFactMentions(fact.statement, knowledge, facts)).toEqual([
    fact.id,
  ]);
});
