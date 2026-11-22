import { describe, expect, it } from 'vitest';
import { diceSeed, duel } from './testing/combat.js';
import { entry, fixture, rejects, value } from './testing/fixtures.js';

describe('initiative and combat start', () => {
  it('records d20 plus DEX for every conscious character in the room, highest first', () => {
    const engine = fixture(
      (seed) => {
        const watcher = entry(seed.characters, 'char:watcher');
        watcher.hp = 0;
        watcher.conscious = false;
      },
      diceSeed(10, 15, 3),
    );
    expect(
      engine.attack({ attacker: 'char:player', target: 'char:peer' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(engine.collectEvents()).toMatchObject([
      {
        type: 'CombatStarted',
        actor: 'char:player',
        payload: {
          order: ['char:peer', 'char:player', 'char:seller'],
          round: 1,
          turn: 0,
          initiative: [
            {
              characterId: 'char:peer',
              roll: { expr: '1d20+5', rolls: [15], total: 20 },
            },
            { characterId: 'char:player', roll: { rolls: [10], total: 15 } },
            { characterId: 'char:seller', roll: { rolls: [3], total: 8 } },
          ],
        },
        witnesses: ['char:player', 'char:peer', 'char:seller'],
      },
    ]);
    expect(engine.state.combat).toEqual({
      order: ['char:peer', 'char:player', 'char:seller'],
      turn: 0,
      round: 1,
      roomId: 'loc:room',
      moved: false,
    });
  });

  it('breaks equal totals by the higher DEX score, including equal modifiers', () => {
    const engine = duel(
      (seed) => {
        entry(seed.characters, 'char:player').abilities.dex = 19;
        entry(seed.characters, 'char:peer').abilities.dex = 18;
      },
      diceSeed(10, 10),
    );
    value(engine.attack({ attacker: 'char:player', target: 'char:peer' }));
    expect(engine.state.combat?.order).toEqual(['char:player', 'char:peer']);
  });

  it('breaks equal totals and DEX by character id, independent of insertion order', () => {
    const engine = duel(() => {}, diceSeed(10, 10));
    engine.attack({ attacker: 'char:player', target: 'char:peer' });
    expect(engine.state.combat?.order).toEqual(['char:peer', 'char:player']);
  });

  it('commits only initiative when the initiating attacker loses, then rejects without any further changes', () => {
    const seed = diceSeed(1, 20);
    const engine = duel(() => {}, seed);
    const before = engine.snapshot();
    const input = { attacker: 'char:player', target: 'char:peer' } as const;
    const result = engine.attack(input);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'NOT_YOUR_TURN',
      },
    });
    if (result.ok) throw new Error('Expected initiative refusal');
    expect(result.error.message).toContain('char:peer');
    expect(engine.snapshot().state.rngState).not.toBe(before.state.rngState);
    expect(engine.state.characters).toEqual(before.state.characters);
    expect(engine.collectEvents().map((event) => event.type)).toEqual([
      'CombatStarted',
    ]);
    rejects(engine, () => engine.attack(input), 'NOT_YOUR_TURN', 'char:player');
    const replay = duel(() => {}, seed);
    replay.attack(input);
    expect(engine.snapshot()).toEqual(replay.snapshot());
  });

  it('returns CombatStarted along with the resolved attack when the attacker wins initiative', () => {
    const engine = duel(() => {}, diceSeed(20, 1, 10));
    const result = engine.attack({
      attacker: 'char:player',
      target: 'char:peer',
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.events.map((event) => event.type)).toEqual([
      'CombatStarted',
      'AttackResolved',
      'DamageApplied',
      'TurnAdvanced',
    ]);
    expect(result.events).toEqual(engine.collectEvents());
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Combat started'),
        expect.stringContaining('attacked'),
        expect.stringContaining('damage'),
      ]),
    );
  });

  it('does not start combat for an invalid attack', () => {
    const engine = duel();
    rejects(
      engine,
      () => engine.attack({ attacker: 'char:player', target: 'char:other' }),
      'NOT_IN_SAME_ROOM',
    );
    rejects(
      engine,
      () => engine.attack({ attacker: 'char:player', target: 'char:missing' }),
      'NO_SUCH_ENTITY',
    );
    rejects(
      engine,
      () =>
        engine.attack({
          attacker: 'char:player',
          target: 'char:peer',
          weaponId: 'item:key',
        }),
      'INVALID_WEAPON',
    );
    rejects(
      engine,
      () =>
        engine.attack({
          attacker: 'char:player',
          target: 'char:peer',
          weaponId: 'item:goods',
        }),
      'ITEM_NOT_REACHABLE',
    );
  });

  it('rejects an unconscious initiator before rolling initiative', () => {
    const engine = duel((seed) => {
      const player = entry(seed.characters, 'char:player');
      player.hp = 0;
      player.conscious = false;
    });
    rejects(
      engine,
      () => engine.attack({ attacker: 'char:player', target: 'char:peer' }),
      'ACTOR_UNCONSCIOUS',
    );
  });

  it('resolves spot occupants to the combat room', () => {
    const engine = duel((seed) => {
      seed.locations.push({
        ...entry(seed.locations, 'loc:room'),
        id: 'loc:corner',
        kind: 'spot',
        partOf: 'loc:room',
        tileBounds: { x: 1, y: 3, w: 1, h: 1 },
      });
      entry(seed.characters, 'char:peer').location = 'loc:corner';
    });
    engine.attack({ attacker: 'char:player', target: 'char:peer' });
    expect(engine.state.combat?.order).toHaveLength(2);
    expect(engine.state.combat?.roomId).toBe('loc:room');
  });
});
