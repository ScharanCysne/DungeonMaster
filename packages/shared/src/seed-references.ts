import type { EpisodeSeed } from './seed.js';

export function validateSeedReferences(seed: EpisodeSeed): string[] {
  const problems: string[] = [];
  const nodes = [
    ...seed.locations,
    ...seed.characters,
    ...seed.containers,
    ...seed.items,
    ...seed.facts,
    ...seed.quests,
    ...seed.factions,
  ];
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) problems.push(`Duplicate id "${node.id}"`);
    ids.add(node.id);
  }
  const reference = (id: string, context: string) => {
    if (!ids.has(id)) problems.push(`${context}: unknown id "${id}"`);
  };
  for (const location of seed.locations) {
    if (location.partOf !== undefined)
      reference(location.partOf, `${location.id}.partOf`);
  }
  for (const entity of [...seed.characters, ...seed.containers])
    reference(entity.location, `${entity.id}.location`);
  for (const item of seed.items) reference(item.holder.id, `${item.id}.holder`);
  for (const fact of seed.facts) {
    for (const id of fact.about) reference(id, `${fact.id}.about`);
    for (const knowledge of fact.knownBy)
      reference(knowledge.character, `${fact.id}.knownBy`);
  }
  for (const quest of seed.quests) {
    if (quest.kind === 'personal')
      reference(quest.pursuedBy, `${quest.id}.pursuedBy`);
  }
  for (const faction of seed.factions) {
    for (const member of faction.members)
      reference(member.character, `${faction.id}.members`);
  }
  for (const attitude of seed.attitudes) {
    reference(attitude.from, `attitude from ${attitude.from}`);
    reference(attitude.to, `attitude to ${attitude.to}`);
  }
  for (const secret of seed.secrets) {
    reference(secret.character, `secret ${secret.fact} owner`);
    reference(secret.fact, `secret of ${secret.character}`);
  }
  const critical = seed.items.filter((item) => item.questCritical);
  if (critical.length !== 1)
    problems.push(
      `Expected exactly one questCritical item; found ${critical.length}: ${critical.map((item) => item.id).join(', ') || '(none)'}`,
    );
  const players = seed.characters.filter(
    (character) => character.role === 'player',
  );
  if (players.length !== 1)
    problems.push(
      `Expected exactly one player; found ${players.length}: ${players.map((character) => character.id).join(', ') || '(none)'}`,
    );
  return problems;
}
