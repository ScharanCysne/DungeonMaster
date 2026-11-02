import type { Character } from '@dungeon/shared';

const CLASSES = new Set([
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
]);
export function characterDetails(character: Character): string {
  const characterClass = character.tags.find((tag) => CLASSES.has(tag));
  const level = /\blevel\s+(\d+)\b/iu.exec(character.summary)?.[1];
  return [characterClass, level ? `level ${level}` : undefined]
    .filter(Boolean)
    .join(' · ');
}
