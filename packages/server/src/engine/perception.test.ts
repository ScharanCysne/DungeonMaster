import { describe, expect, it } from 'vitest';
import type { Skill } from '@dungeon/shared';
import type { Engine } from './index.js';
import { entry, fixture, value } from './testing/fixtures.js';

function openWitnesses(engine: Engine, privateEvent = false) {
  value(
    engine.open_container(
      { actor: 'char:player', container: 'container:box' },
      { private: privateEvent },
    ),
  );
  return engine.collectEvents().at(-1)?.witnesses;
}

function winContest(engine: Engine, skill: Skill): string {
  for (let i = 0; i < 100; i++) {
    const check = value(
      engine.contested_check({
        actor: 'char:player',
        skill,
        target: 'char:seller',
        targetSkill: 'perception',
        reason: '',
      }),
    );
    if (check.winner === 'char:player') return check.checkId;
  }
  throw new Error('Fixture did not produce a win');
}

describe('perception', () => {
  it('includes conscious characters in the event room and excludes other rooms', () => {
    expect(openWitnesses(fixture())).toEqual([
      'char:player',
      'char:peer',
      'char:seller',
      'char:watcher',
    ]);
  });
  it('excludes unconscious characters', () => {
    const engine = fixture((seed) => {
      entry(seed.characters, 'char:watcher').conscious = false;
    });
    expect(openWitnesses(engine)).not.toContain('char:watcher');
  });
  it('retains a witness who leaves the event room later in the beat', () => {
    const engine = fixture();
    const witnesses = openWitnesses(engine);
    expect(witnesses).toContain('char:watcher');
    value(engine.move({ actor: 'char:watcher', to: 'loc:other' }));
    expect(engine.collectEvents()[0]?.witnesses).toEqual(witnesses);
  });
  it('does not add a witness who enters the event room later in the beat', () => {
    const engine = fixture((seed) => {
      const container = entry(seed.containers, 'container:box');
      container.location = 'loc:other';
      container.tile = { x: 5, y: 2 };
    });
    value(
      engine.open_container({
        actor: 'char:other',
        container: 'container:box',
      }),
    );
    value(engine.move({ actor: 'char:player', to: 'loc:other' }));
    expect(engine.collectEvents()[0]?.witnesses).toEqual(['char:other']);
    expect(engine.collectEvents().at(-1)?.witnesses).toEqual([
      'char:player',
      'char:other',
    ]);
  });
  it('limits a private container action to its actor', () => {
    expect(openWitnesses(fixture(), true)).toEqual(['char:player']);
  });
  it('includes explicit character targets of a private transfer', () => {
    const engine = fixture();
    value(
      engine.transfer_item(
        {
          actor: 'char:player',
          item: 'item:rock',
          to: 'char:peer',
          reason: 'give',
        },
        { private: true },
      ),
    );
    expect(engine.collectEvents().at(-1)?.witnesses).toEqual([
      'char:player',
      'char:peer',
    ]);
  });
  it('includes the seller and buyer as explicit private purchase participants', () => {
    const engine = fixture();
    value(
      engine.transfer_item(
        {
          actor: 'char:player',
          item: 'item:goods',
          to: 'char:player',
          reason: 'buy',
          price: 1,
        },
        { private: true },
      ),
    );
    expect(engine.collectEvents().at(-1)?.witnesses).toEqual([
      'char:player',
      'char:seller',
    ]);
  });
  it.each(['stealth', 'sleight_of_hand'] as const)(
    'excludes a character beaten by the actor’s contested %s this beat',
    (skill) => {
      const engine = fixture();
      winContest(engine, skill);
      expect(openWitnesses(engine)).not.toContain('char:seller');
    },
  );
  it('does not apply a contested deception win as stealth', () => {
    const engine = fixture();
    winContest(engine, 'deception');
    expect(openWitnesses(engine)).toContain('char:seller');
  });
  it('does not apply stealth wins from an earlier beat', () => {
    const engine = fixture();
    winContest(engine, 'stealth');
    engine.beginBeat(2);
    expect(openWitnesses(engine)).toContain('char:seller');
  });
  it('excludes a witness beaten in a stealth contest after the event in the same beat', () => {
    const engine = fixture();
    expect(openWitnesses(engine)).toContain('char:seller');
    winContest(engine, 'stealth');
    expect(engine.collectEvents()[0]?.witnesses).not.toContain('char:seller');
  });
  it('retains a witness knocked unconscious later in the beat', () => {
    const engine = fixture();
    const witnesses = openWitnesses(engine);
    expect(witnesses).toContain('char:watcher');
    value(
      engine.apply_damage({
        target: 'char:watcher',
        dice: '1d4+100',
        cause: 'fall',
      }),
    );
    expect(engine.collectEvents()[0]?.witnesses).toEqual(witnesses);
    expect(engine.collectEvents().at(-1)?.witnesses).not.toContain(
      'char:watcher',
    );
  });
  it('does not add a witness healed to consciousness later in the beat', () => {
    const engine = fixture((seed) => {
      const watcher = entry(seed.characters, 'char:watcher');
      watcher.hp = 0;
      watcher.conscious = false;
    });
    const witnesses = openWitnesses(engine);
    expect(witnesses).not.toContain('char:watcher');
    value(engine.heal({ target: 'char:watcher', dice: '1d4', source: 'rest' }));
    expect(engine.collectEvents()[0]?.witnesses).toEqual(witnesses);
    expect(engine.collectEvents().at(-1)?.witnesses).toContain('char:watcher');
  });
  it('excludes uninvolved characters without darkvision in an unlit room', () => {
    const engine = fixture((seed) => {
      entry(seed.locations, 'loc:room').lit = false;
    });
    expect(openWitnesses(engine)).toEqual(['char:player']);
  });
  it('lets darkvision-tagged characters witness events in an unlit room', () => {
    const engine = fixture((seed) => {
      entry(seed.locations, 'loc:room').lit = false;
      entry(seed.characters, 'char:watcher').tags.push('darkvision');
    });
    expect(openWitnesses(engine)).toEqual(['char:player', 'char:watcher']);
  });
  it('lets explicit targets witness their own event in darkness without darkvision', () => {
    const engine = fixture((seed) => {
      entry(seed.locations, 'loc:room').lit = false;
    });
    value(
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:rock',
        to: 'char:peer',
        reason: 'give',
      }),
    );
    expect(engine.collectEvents().at(-1)?.witnesses).toEqual([
      'char:player',
      'char:peer',
    ]);
  });
  it('treats spots within a room as the same room and uses the room’s light', () => {
    const engine = fixture((seed) => {
      entry(seed.locations, 'loc:room').lit = false;
      seed.locations.push({
        id: 'loc:spot',
        name: 'Spot',
        summary: '',
        tags: [],
        kind: 'spot',
        partOf: 'loc:room',
        lit: true,
        tileBounds: { x: 2, y: 0, w: 1, h: 1 },
      });
      entry(seed.characters, 'char:watcher').location = 'loc:spot';
      entry(seed.characters, 'char:watcher').tags.push('darkvision');
    });
    expect(openWitnesses(engine)).toContain('char:watcher');
  });
  it('applies stealth exclusion even to an explicit target', () => {
    const engine = fixture();
    winContest(engine, 'stealth');
    value(
      engine.transfer_item(
        {
          actor: 'char:player',
          item: 'item:rock',
          to: 'char:seller',
          reason: 'give',
        },
        { private: true },
      ),
    );
    expect(engine.collectEvents().at(-1)?.witnesses).toEqual(['char:player']);
  });
  it('attributes automatic unequipping during theft to the thief and preserves stealth', () => {
    const engine = fixture();
    value(
      engine.equip({
        actor: 'char:seller',
        item: 'item:goods',
        slot: 'main_hand',
      }),
    );
    const checkId = winContest(engine, 'sleight_of_hand');
    const result = engine.transfer_item(
      {
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'steal',
        checkId,
      },
      { private: true },
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(
      result.events.map((event) => ({
        actor: event.actor,
        witnesses: event.witnesses,
      })),
    ).toEqual([
      { actor: 'char:player', witnesses: ['char:player'] },
      { actor: 'char:player', witnesses: ['char:player'] },
    ]);
  });
  it('uses the winning defender’s stealth skill for their later events', () => {
    const engine = fixture();
    for (let i = 0; i < 100; i++) {
      const check = value(
        engine.contested_check({
          actor: 'char:seller',
          skill: 'perception',
          target: 'char:player',
          targetSkill: 'stealth',
          reason: '',
        }),
      );
      if (check.winner === 'char:player') break;
    }
    expect(openWitnesses(engine)).not.toContain('char:seller');
  });
  it('does not interpret tied stealth contests as wins by a system event’s null actor', () => {
    const engine = fixture();
    for (let i = 0; i < 100; i++) {
      const check = value(
        engine.contested_check({
          actor: 'char:seller',
          skill: 'stealth',
          target: 'char:player',
          targetSkill: 'stealth',
          reason: '',
        }),
      );
      if (check.winner === null) break;
    }
    value(
      engine.apply_damage({ target: 'char:peer', dice: '1d4', cause: 'fall' }),
    );
    expect(engine.collectEvents().at(-1)?.witnesses).toEqual([
      'char:player',
      'char:peer',
      'char:seller',
      'char:watcher',
    ]);
  });
});
