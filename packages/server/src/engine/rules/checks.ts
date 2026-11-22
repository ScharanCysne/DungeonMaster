import type { Ability, Advantage, Roll, Skill } from '@dungeon/shared';
import type { EngineCharacter } from '../state.js';
import { rollDice } from './dice.js';
import type { RandomState } from './dice.js';

export const skillAbilities: Readonly<Record<Skill, Ability>> = {
  acrobatics: 'dex',
  animal_handling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function checkRoll(
  state: RandomState,
  actor: EngineCharacter,
  ability: Ability,
  skill: Skill | undefined,
  advantage: Advantage,
): Roll {
  const modifier =
    abilityModifier(actor.abilities[ability]) +
    (skill !== undefined && actor.proficiencies.includes(skill) ? 2 : 0);
  const dice = advantage === 'none' ? '1d20' : '2d20';
  const roll = rollDice(state, `${dice}${modifier >= 0 ? '+' : ''}${modifier}`);
  const kept =
    advantage === 'disadvantage'
      ? Math.min(...roll.rolls)
      : Math.max(...roll.rolls);
  return { ...roll, total: kept + modifier };
}
