import type { CharacterId, ResolvedNarration } from '@dungeon/shared';
import type { LogDraft } from '../../ontology/eventLog.js';

function sentence(event: LogDraft, player: CharacterId): string | undefined {
  const own = event.actor === player;
  switch (event.type) {
    case 'EntityMoved':
      return event.payload.entityId === player
        ? 'You move to a new position.'
        : 'You see movement nearby.';
    case 'ItemTransferred':
      return 'You see an item change hands or resting place.';
    case 'ItemEquipped':
      return event.payload.characterId === player
        ? 'You ready your equipment.'
        : 'You see someone ready their equipment.';
    case 'ItemUnequipped':
      return event.payload.characterId === player
        ? 'You put equipment aside.'
        : 'You see someone put equipment aside.';
    case 'ContainerOpened':
      return 'You see a container open.';
    case 'ContainerUnlocked':
      return 'You see a lock released.';
    case 'EntityRevealed':
      return 'You notice something previously concealed.';
    case 'EntityHidden':
      return own ? 'You take cover.' : 'You see something concealed.';
    case 'CheckRolled':
      return own ? 'You make an attempt.' : 'You observe an attempt nearby.';
    case 'AttackResolved':
      return event.payload.attacker === player
        ? 'You make an attack.'
        : 'You witness an attack.';
    case 'DamageApplied':
      if (event.payload.amount === 0) return undefined;
      return event.payload.target === player
        ? 'You are hurt.'
        : 'You see someone hurt.';
    case 'Healed':
      if (event.payload.amount === 0) return undefined;
      return event.payload.target === player
        ? 'You recover some strength.'
        : 'You see someone recover some strength.';
    case 'CombatStarted':
      return 'You are present as a confrontation begins.';
    case 'CombatEnded':
      return 'You witness the confrontation end.';
    case 'EntityCreated':
      return 'You notice something new nearby.';
    case 'FactLearned':
      return event.payload.characterId === player
        ? 'You learn something new.'
        : undefined;
    default:
      return undefined;
  }
}

export function neutralSummary(
  events: readonly LogDraft[],
  player: CharacterId,
): ResolvedNarration {
  const sentences: string[] = [];
  let words = 0;
  for (const event of events) {
    if (!event.witnesses.includes(player)) continue;
    const text = sentence(event, player);
    if (!text) continue;
    const count = text.split(/\s/u).length;
    if (words + count > 120) break;
    words += count;
    sentences.push(text);
  }
  return {
    text: sentences.join(' ') || 'You notice no further change.',
    lines: [],
  };
}
