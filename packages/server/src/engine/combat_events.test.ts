import { describe, expect, it } from 'vitest';
import { eventPayloadSchemas, toolSchemas } from '@dungeon/shared';
import type { CharacterId } from '@dungeon/shared';
import type { CombatState } from './index.js';
import { diceSeed, duel, startOnPeer } from './testing/combat.js';
import { entry, rejects, value } from './testing/fixtures.js';

describe('combat events and ending', () => {
  it('reconstructs all combat state at every step of a full brawl from the event sequence', () => {
    const engine = duel(
      (seed) => {
        entry(seed.characters, 'char:peer').hp = 1;
        const seller = entry(seed.characters, 'char:seller');
        seller.location = 'loc:room';
        seller.tile = { x: 3, y: 2 };
        seller.conscious = false;
      },
      diceSeed(1, 20, 10),
    );
    let combat: CombatState | null = null;
    const locations = new Map(
      [...engine.state.characters].map(([id, character]) => [
        id,
        character.locationId,
      ]),
    );
    let read = 0;
    const replay = () => {
      const events = engine.collectEvents();
      for (const event of events.slice(read)) {
        expect(
          eventPayloadSchemas[event.type].safeParse(event.payload).success,
        ).toBe(true);
        if (event.type === 'CombatStarted') {
          if (!event.actor) throw new Error('Expected combat instigator');
          const roomId = locations.get(event.actor);
          if (!roomId) throw new Error('Expected combat room');
          const { order, turn, round } = event.payload;
          combat = { order, turn, round, roomId, moved: false };
        } else if (event.type === 'EntityMoved' && event.actor) {
          locations.set(event.actor, event.payload.to);
          if (combat?.order[combat.turn] === event.actor) combat.moved = true;
        } else if (event.type === 'TurnAdvanced') {
          if (!combat) throw new Error('Expected combat before turn');
          expect(combat.order[event.payload.turn]).toBe(
            event.payload.combatant,
          );
          combat.turn = event.payload.turn;
          combat.round = event.payload.round;
          combat.moved = false;
        } else if (event.type === 'CombatEnded') combat = null;
      }
      read = events.length;
      expect(combat).toEqual(engine.state.combat);
    };
    expect(
      engine.attack({ attacker: 'char:player', target: 'char:peer' }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    replay();
    const passed = value(engine.pass_turn({ actor: 'char:peer' }));
    expect(toolSchemas.pass_turn.output.safeParse(passed).success).toBe(true);
    replay();
    value(engine.move({ actor: 'char:player', to: 'container:box' }));
    replay();
    const attacked = value(
      engine.attack({ attacker: 'char:player', target: 'char:peer' }),
    );
    expect(toolSchemas.attack.output.safeParse(attacked).success).toBe(true);
    replay();
    expect(engine.state.characters.get('char:peer')).toMatchObject({
      hp: 0,
      conscious: false,
    });
    rejects(
      engine,
      () => engine.attack({ attacker: 'char:peer', target: 'char:player' }),
      'NOT_YOUR_TURN',
    );
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'loot',
      }),
    );
    replay();
    expect(engine.state.items.get('item:goods')?.holder).toEqual({
      kind: 'character',
      id: 'char:player',
    });
    value(engine.pass_turn({ actor: 'char:player' }));
    replay();
    const ended = value(engine.end_combat({ reason: 'defeated' }));
    expect(toolSchemas.end_combat.output.safeParse(ended).success).toBe(true);
    replay();
    const events = engine.collectEvents();
    expect(events.map((event) => event.type)).toEqual([
      'CombatStarted',
      'TurnAdvanced',
      'EntityMoved',
      'AttackResolved',
      'DamageApplied',
      'TurnAdvanced',
      'ItemTransferred',
      'TurnAdvanced',
      'TurnAdvanced',
      'CombatEnded',
    ]);
    expect(
      events
        .filter((event) => event.type === 'TurnAdvanced')
        .map((event) => event.payload),
    ).toEqual([
      { combatant: 'char:player', round: 1, turn: 1 },
      { combatant: 'char:player', round: 2, turn: 1 },
      { combatant: 'char:player', round: 3, turn: 1 },
      { combatant: 'char:player', round: 4, turn: 1 },
    ]);
    expect(events[0]?.witnesses).toContain('char:peer');
    expect(events[2]?.witnesses).toContain('char:peer');
    expect(
      events.slice(3).every((event) => !event.witnesses.includes('char:peer')),
    ).toBe(true);
  });

  it.each(['fled', 'surrendered', 'defeated', 'talked_down'] as const)(
    'ends combat for %s and permits free action afterwards',
    (reason) => {
      const engine = duel();
      startOnPeer(engine);
      const result = engine.end_combat({ reason });
      if (!result.ok) throw new Error(result.error.message);
      expect(result).toMatchObject({
        value: { reason },
        events: [{ type: 'CombatEnded', actor: null, payload: { reason } }],
        facts: [expect.stringContaining(reason)],
      });
      expect(engine.state.combat).toBeNull();
      value(engine.move({ actor: 'char:player', to: 'loc:room' }));
      value(engine.move({ actor: 'char:player', to: 'loc:room' }));
      rejects(engine, () => engine.end_combat({ reason }), 'NO_ACTIVE_COMBAT');
    },
  );

  it('rejects end_combat before combat begins', () => {
    const engine = duel();
    rejects(
      engine,
      () => engine.end_combat({ reason: 'talked_down' }),
      'NO_ACTIVE_COMBAT',
    );
  });

  it('starts a fresh initiative, movement allowance and round after ending', () => {
    const engine = duel();
    startOnPeer(engine);
    value(engine.move({ actor: 'char:peer', to: 'loc:room' }));
    value(engine.end_combat({ reason: 'talked_down' }));
    const offset = engine.collectEvents().length;
    engine.attack({ attacker: 'char:player', target: 'char:peer' });
    expect(engine.collectEvents()[offset]).toMatchObject({
      type: 'CombatStarted',
      payload: { round: 1, turn: 0 },
    });
    expect(engine.state.combat?.moved).toBe(false);
  });

  it('applies darkness and private target rules to every combat event', () => {
    const engine = duel(
      (seed) => {
        entry(seed.locations, 'loc:room').lit = false;
      },
      diceSeed(20, 1, 10),
    );
    value(
      engine.attack(
        { attacker: 'char:player', target: 'char:peer' },
        { private: true },
      ),
    );
    value(engine.end_combat({ reason: 'talked_down' }));
    const witnesses: CharacterId[][] = engine
      .collectEvents()
      .map((event) => event.witnesses);
    expect(witnesses).toEqual([
      ['char:player', 'char:peer'],
      ['char:player', 'char:peer'],
      ['char:player', 'char:peer'],
      ['char:peer'],
      [],
    ]);
    expect(
      engine
        .collectEvents()
        .slice(0, 4)
        .every((event) => event.private),
    ).toBe(true);
  });

  it('keeps captured combat witnesses after later movement and unconsciousness', () => {
    const engine = duel(() => {}, diceSeed(1, 20));
    startOnPeer(engine);
    value(engine.move({ actor: 'char:peer', to: 'loc:other' }));
    value(
      engine.apply_damage({
        target: 'char:peer',
        dice: '1d4+100',
        cause: 'Fire',
      }),
    );
    const events = engine.collectEvents();
    expect(events[0]?.witnesses).toEqual(['char:player', 'char:peer']);
    expect(
      events.find((event) => event.type === 'TurnAdvanced')?.witnesses,
    ).toEqual(['char:player']);
  });
});
