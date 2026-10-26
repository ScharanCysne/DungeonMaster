import type { CharacterId, EpisodeSeed } from '@dungeon/shared';
import { beatSeed, rollDice } from '../index.js';
import type { Engine } from '../index.js';
import { entry, fixture, value } from './fixtures.js';

export function duel(
  edit: (seed: EpisodeSeed) => void = () => {},
  sessionSeed = 'combat',
): Engine {
  return fixture((seed) => {
    for (const id of ['char:seller', 'char:watcher']) {
      const character = entry(seed.characters, id);
      character.location = 'loc:other';
      character.tile = id === 'char:seller' ? { x: 5, y: 2 } : { x: 7, y: 3 };
    }
    edit(seed);
  }, sessionSeed);
}

export function diceSeed(...dice: (number | undefined)[]): string {
  for (let candidate = 0; candidate < 100_000; candidate++) {
    const seed = `combat-${candidate}`;
    const state = { rngState: beatSeed(seed, 1, 0) };
    const rolled = dice.map(() => rollDice(state, '1d20').rolls[0]);
    if (dice.every((die, index) => die === undefined || die === rolled[index]))
      return seed;
  }
  throw new Error(`No seed for ${dice.join(', ')}`);
}

export function turnActor(engine: Engine): CharacterId {
  const combat = engine.state.combat;
  const actor = combat?.order[combat.turn];
  if (!actor) throw new Error('Expected an active combatant');
  return actor;
}

export function passTo(engine: Engine, actor: CharacterId): void {
  const count = engine.state.combat?.order.length ?? 0;
  for (let i = 0; i < count && turnActor(engine) !== actor; i++)
    value(engine.pass_turn({ actor: turnActor(engine) }));
  if (turnActor(engine) !== actor) throw new Error(`${actor} has no turn`);
}

export function startOnPeer(engine: Engine): void {
  engine.attack({ attacker: 'char:player', target: 'char:peer' });
  passTo(engine, 'char:peer');
}
