import { describe, expect, it } from 'vitest';
import { combatActions } from './testing/combat-actions.js';
import {
  diceSeed,
  duel,
  passTo,
  startOnPeer,
  turnActor,
} from './testing/combat.js';
import { entry, fixture, rejects, value } from './testing/fixtures.js';

describe('combat turns', () => {
  it.each(combatActions)(
    'rejects $name out of turn with the entire snapshot unchanged',
    ({ prepare }) => {
      const engine = duel((seed) => {
        const peer = entry(seed.characters, 'char:peer');
        peer.hp = peer.maxHp = 50;
      });
      const command = prepare(engine);
      startOnPeer(engine);
      rejects(engine, command, 'NOT_YOUR_TURN', 'char:player');
    },
  );

  it.each(combatActions)(
    '$name consumes the action and ends the turn',
    ({ prepare }) => {
      const engine = duel((seed) => {
        const peer = entry(seed.characters, 'char:peer');
        peer.hp = peer.maxHp = 50;
      });
      const command = prepare(engine);
      startOnPeer(engine);
      passTo(engine, 'char:player');
      const result = command();
      value(result);
      if (!result.ok) throw new Error(result.error.message);
      expect(turnActor(engine)).toBe('char:peer');
      expect(result.events.at(-1)).toMatchObject({
        type: 'TurnAdvanced',
        payload: { combatant: 'char:peer' },
      });
      rejects(engine, command, 'NOT_YOUR_TURN', 'char:player');
    },
  );

  it('allows a move and an action, rejects a second move, and restores movement next turn', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    rejects(
      engine,
      () => engine.move({ actor: 'char:player', to: 'loc:room' }),
      'NOT_YOUR_TURN',
    );
    value(engine.move({ actor: 'char:peer', to: 'container:box' }));
    expect(engine.state.combat).toMatchObject({
      turn: 0,
      round: 1,
      moved: true,
    });
    rejects(
      engine,
      () => engine.move({ actor: 'char:peer', to: 'loc:room' }),
      'MOVE_ALREADY_USED',
    );
    value(
      engine.open_container({ actor: 'char:peer', container: 'container:box' }),
    );
    expect(engine.state.combat).toMatchObject({
      turn: 1,
      round: 1,
      moved: false,
    });
    rejects(
      engine,
      () =>
        engine.open_container({
          actor: 'char:peer',
          container: 'container:box',
        }),
      'NOT_YOUR_TURN',
    );
    value(engine.pass_turn({ actor: 'char:player' }));
    expect(engine.state.combat).toMatchObject({ turn: 0, round: 2 });
    value(engine.move({ actor: 'char:peer', to: 'loc:room' }));
  });

  it('allows pass_turn before or after movement and emits the next position', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    expect(value(engine.pass_turn({ actor: 'char:peer' }))).toEqual({
      combatant: 'char:player',
      round: 1,
      turn: 1,
    });
    value(engine.move({ actor: 'char:player', to: 'loc:room' }));
    expect(value(engine.pass_turn({ actor: 'char:player' }))).toEqual({
      combatant: 'char:peer',
      round: 2,
      turn: 0,
    });
  });

  it('rejects pass_turn without combat or out of turn', () => {
    const engine = duel();
    rejects(
      engine,
      () => engine.pass_turn({ actor: 'char:player' }),
      'NO_ACTIVE_COMBAT',
    );
    startOnPeer(engine);
    rejects(
      engine,
      () => engine.pass_turn({ actor: 'char:player' }),
      'NOT_YOUR_TURN',
    );
    rejects(
      engine,
      () => engine.move({ actor: 'char:other', to: 'loc:room' }),
      'NOT_YOUR_TURN',
    );
  });

  it('does not consume movement or an action on a rejected command', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    rejects(
      engine,
      () => engine.move({ actor: 'char:peer', to: 'loc:missing' }),
      'NO_SUCH_ENTITY',
    );
    value(engine.move({ actor: 'char:peer', to: 'loc:room' }));
    rejects(
      engine,
      () =>
        engine.open_container({
          actor: 'char:peer',
          container: 'container:lockbox',
        }),
      'CONTAINER_LOCKED',
    );
    value(
      engine.open_container({ actor: 'char:peer', container: 'container:box' }),
    );
    expect(turnActor(engine)).toBe('char:player');
  });

  it('skips unconscious combatants on advancement, increments the round on wrap, and preserves order', () => {
    const engine = fixture();
    engine.attack({ attacker: 'char:player', target: 'char:peer' });
    const order = engine.state.combat?.order ?? [];
    const current = turnActor(engine);
    for (const target of order.filter((id) => id !== current))
      value(
        engine.apply_damage({ target, dice: '1d4+100', cause: 'Falling beam' }),
      );
    const round = engine.state.combat?.round ?? 0;
    value(engine.pass_turn({ actor: current }));
    expect(engine.state.combat).toMatchObject({
      order,
      round: round + 1,
      moved: false,
    });
    expect(turnActor(engine)).toBe(current);
  });

  it('advances immediately when the current combatant flees and skips them on subsequent rounds', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    const moved = engine.move({ actor: 'char:peer', to: 'loc:other' });
    if (!moved.ok) throw new Error(moved.error.message);
    expect(moved.events.map((event) => event.type)).toEqual([
      'EntityMoved',
      'TurnAdvanced',
    ]);
    expect(turnActor(engine)).toBe('char:player');
    expect(value(engine.pass_turn({ actor: 'char:player' }))).toEqual({
      combatant: 'char:player',
      turn: 1,
      round: 2,
    });
    rejects(
      engine,
      () => engine.pass_turn({ actor: 'char:peer' }),
      'NOT_YOUR_TURN',
    );
  });

  it('advances when environmental damage knocks out the current combatant', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    value(
      engine.apply_damage({
        target: 'char:peer',
        dice: '1d4+100',
        cause: 'Fire',
      }),
    );
    expect(turnActor(engine)).toBe('char:player');
    expect(engine.collectEvents().at(-1)).toMatchObject({
      type: 'TurnAdvanced',
    });
  });

  it('retains active combat with no eligible combatants, and permits explicit ending', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    for (const target of ['char:player', 'char:peer'] as const)
      value(engine.apply_damage({ target, dice: '1d4+100', cause: 'Fire' }));
    const combat = engine.state.combat;
    expect(combat).not.toBeNull();
    rejects(
      engine,
      () => engine.pass_turn({ actor: turnActor(engine) }),
      'ACTOR_UNCONSCIOUS',
    );
    value(engine.end_combat({ reason: 'defeated' }));
    expect(engine.state.combat).toBeNull();
  });

  it('retains combat after the last conscious combatant flees', () => {
    const engine = duel(
      (seed) => {
        entry(seed.characters, 'char:peer').conscious = false;
      },
      diceSeed(10, 1),
    );
    value(engine.attack({ attacker: 'char:player', target: 'char:peer' }));
    value(engine.move({ actor: 'char:player', to: 'loc:other' }));
    expect(engine.state.combat).not.toBeNull();
    rejects(
      engine,
      () => engine.pass_turn({ actor: 'char:player' }),
      'NOT_YOUR_TURN',
    );
    value(engine.end_combat({ reason: 'fled' }));
  });

  it('item and rest healing do not consume an action, and restored combatants rejoin subsequent turns', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    const before = engine.state.combat;
    value(
      engine.heal({
        target: 'char:player',
        dice: '1d4',
        source: 'item:potion',
      }),
    );
    expect(engine.state.combat).toEqual(before);
    value(
      engine.apply_damage({
        target: 'char:player',
        dice: '1d4+100',
        cause: 'Fire',
      }),
    );
    value(engine.heal({ target: 'char:player', dice: '1d4', source: 'rest' }));
    expect(engine.state.combat).toEqual(before);
    expect(value(engine.pass_turn({ actor: 'char:peer' })).combatant).toBe(
      'char:player',
    );
  });
});
